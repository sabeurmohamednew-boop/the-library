import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";
import { contentTypeForPath, getStorageFileInfo, resolveStoragePath, sanitizeFileStem } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type RangeResult =
  | { type: "none" }
  | { type: "valid"; start: number; end: number }
  | { type: "invalid" };

function devLog(message: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[book-file] ${message}`, data ?? "");
  }
}

function parseRange(rangeHeader: string | null, size: number): RangeResult {
  if (!rangeHeader) return { type: "none" };
  if (!rangeHeader.startsWith("bytes=") || rangeHeader.includes(",")) return { type: "invalid" };

  const [startValue, endValue] = rangeHeader.replace("bytes=", "").split("-");
  if (startValue === undefined || endValue === undefined) return { type: "invalid" };

  let start: number;
  let end: number;

  if (startValue === "") {
    const suffixLength = Number(endValue);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { type: "invalid" };
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(startValue);
    end = endValue ? Number(endValue) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return { type: "invalid" };
  }

  return { type: "valid", start, end: Math.min(end, size - 1) };
}

function dispositionFilename(title: string, extension: string) {
  const safe = sanitizeFileStem(title || "book");
  return `${safe}${extension}`;
}

async function handleFileRequest(request: Request, context: RouteContext, headOnly = false) {
  const { slug } = await context.params;
  const decodedSlug = decodeURIComponent(slug);
  const book = await getBookBySlug(decodedSlug);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  try {
    const filePath = resolveStoragePath(book.filePath);
    const info = await getStorageFileInfo(book.filePath);

    if (!info.isFile() || info.size <= 0) {
      devLog("missing-or-empty-file", { slug: decodedSlug, filePath: book.filePath });
      return NextResponse.json({ error: "Book file is unavailable." }, { status: 404 });
    }

    const range = parseRange(request.headers.get("range"), info.size);
    const contentType = contentTypeForPath(book.filePath);
    const extension = path.extname(book.filePath) || (book.format === "PDF" ? ".pdf" : ".epub");
    const filename = dispositionFilename(book.title, extension);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    };

    if (range.type === "invalid") {
      devLog("invalid-range", { slug: decodedSlug, range: request.headers.get("range"), size: info.size });
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${info.size}`,
        },
      });
    }

    if (range.type === "valid") {
      devLog("partial-content", { slug: decodedSlug, start: range.start, end: range.end, size: info.size });
      const length = range.end - range.start + 1;
      const body = headOnly ? null : (Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) as ReadableStream);

      return new Response(body, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": length.toString(),
          "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        },
      });
    }

    devLog("full-content", { slug: decodedSlug, size: info.size, headOnly });
    const body = headOnly ? null : (Readable.toWeb(createReadStream(filePath)) as ReadableStream);
    return new Response(body, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Length": info.size.toString(),
      },
    });
  } catch (error) {
    devLog("file-error", {
      slug: decodedSlug,
      message: error instanceof Error ? error.message : String(error),
      filePath: book.filePath,
    });
    return NextResponse.json({ error: "Book file is unavailable." }, { status: 404 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handleFileRequest(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
  return handleFileRequest(request, context, true);
}
