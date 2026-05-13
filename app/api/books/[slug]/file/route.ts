import path from "node:path";
import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";
import { findLocalBookFile, localNodeFileReadableStream, type LocalFile } from "@/lib/localFiles";
import { getR2Object, r2ConfigError } from "@/lib/r2";
import { logRuntimeFailure, runtimeFailure } from "@/lib/runtime";
import { sanitizeFileStem } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function devLog(message: string, data?: Record<string, unknown>) {
  console.info(`[book-file] ${message}`, {
    at: new Date().toISOString(),
    ...(data ?? {}),
  });
}

function dispositionFilename(title: string, extension: string) {
  const safe = sanitizeFileStem(title || "book");
  return `${safe}${extension}`;
}

function parseRange(range: string | null, size: number) {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return "invalid" as const;

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return "invalid" as const;

  let start: number;
  let end: number;

  if (!startValue) {
    const suffixLength = Number(endValue);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return "invalid" as const;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return "invalid" as const;
  }

  return { start, end: Math.min(end, size - 1) };
}

function localFileResponse(request: Request, book: NonNullable<Awaited<ReturnType<typeof getBookBySlug>>>, localFile: LocalFile, headOnly: boolean) {
  const rangeHeader = request.headers.get("range");
  const range = parseRange(rangeHeader, localFile.size);
  const extension = path.extname(localFile.path) || (book.format === "PDF" ? ".pdf" : ".epub");
  const filename = dispositionFilename(book.title, extension);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": book.fileContentType || (book.format === "PDF" ? "application/pdf" : "application/epub+zip"),
    "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Last-Modified": localFile.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });

  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${localFile.size}`);
    return new Response(null, { status: 416, headers });
  }

  if (range) {
    const contentLength = range.end - range.start + 1;
    headers.set("Content-Length", String(contentLength));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${localFile.size}`);
    return new Response(headOnly ? null : localNodeFileReadableStream(localFile.path, range), {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(localFile.size));
  return new Response(headOnly ? null : localNodeFileReadableStream(localFile.path), {
    status: 200,
    headers,
  });
}

function statusFromStorageError(error: unknown) {
  return typeof error === "object" && error !== null && "$metadata" in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
}

function r2FileResponse(request: Request, book: NonNullable<Awaited<ReturnType<typeof getBookBySlug>>>, r2Object: NonNullable<Awaited<ReturnType<typeof getR2Object>>>, headOnly: boolean) {
  const extension = path.extname(book.bookBlobPath) || (book.format === "PDF" ? ".pdf" : ".epub");
  const filename = dispositionFilename(book.title, extension);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";
  const status = r2Object.contentRange ? 206 : 200;
  const responseHeaders = new Headers({
    "Accept-Ranges": r2Object.acceptRanges ?? "bytes",
    "Content-Type": book.fileContentType || r2Object.contentType || "application/octet-stream",
    "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  });

  if (r2Object.contentLength !== undefined) responseHeaders.set("Content-Length", String(r2Object.contentLength));
  if (r2Object.contentRange) responseHeaders.set("Content-Range", r2Object.contentRange);
  if (r2Object.etag) responseHeaders.set("ETag", r2Object.etag);
  if (r2Object.lastModified) responseHeaders.set("Last-Modified", r2Object.lastModified.toUTCString());

  return new Response(headOnly ? null : r2Object.body, {
    status,
    headers: responseHeaders,
  });
}

async function handleFileRequest(request: Request, context: RouteContext, headOnly = false) {
  const { slug } = await context.params;
  const decodedSlug = decodeURIComponent(slug);
  let book;

  try {
    book = await getBookBySlug(decodedSlug);
  } catch (error) {
    const failure = runtimeFailure("book-file.lookup", error);
    logRuntimeFailure(failure, { slug: decodedSlug });
    return NextResponse.json({ error: failure.userMessage }, { status: 503 });
  }

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  if (!book.bookBlobPath) {
    return NextResponse.json({ error: "Book file is unavailable." }, { status: 404 });
  }

  const range = request.headers.get("range");
  const r2Error = r2ConfigError();
  if (!r2Error) {
    try {
      const startedAt = Date.now();
      devLog("r2-fetch:start", { slug: decodedSlug, range, headOnly, key: book.bookBlobPath });
      const r2Object = await getR2Object(book.bookBlobPath, range);
      devLog("r2-fetch:end", {
        slug: decodedSlug,
        found: Boolean(r2Object),
        range,
        headOnly,
        elapsedMs: Date.now() - startedAt,
        contentType: r2Object?.contentType,
        contentLength: r2Object?.contentLength,
        contentRange: r2Object?.contentRange,
      });

      if (r2Object) return r2FileResponse(request, book, r2Object, headOnly);
    } catch (error) {
      const status = statusFromStorageError(error);
      devLog("r2-error", {
        slug: decodedSlug,
        status,
        range,
        key: book.bookBlobPath,
        message: error instanceof Error ? error.message : String(error),
      });

      if (status === 416) {
        return new Response(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Type": book.fileContentType || "application/octet-stream",
          },
        });
      }
    }
  } else {
    devLog("r2-not-configured", { slug: decodedSlug, missing: r2Error });
  }

  const localFile = await findLocalBookFile(book);
  if (localFile) {
    devLog("local-file", {
      slug: decodedSlug,
      range,
      headOnly,
      path: localFile.path,
      size: localFile.size,
    });
    return localFileResponse(request, book, localFile, headOnly);
  }

  return NextResponse.json({ error: "Book file is unavailable." }, { status: 404 });
}

export async function GET(request: Request, context: RouteContext) {
  return handleFileRequest(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return handleFileRequest(request, context, true);
}
