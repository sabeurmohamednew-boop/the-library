import path from "node:path";
import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";
import { logRuntimeFailure, runtimeFailure } from "@/lib/runtime";
import { sanitizeFileStem } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function devLog(message: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[book-file] ${message}`, data ?? "");
  }
}

function dispositionFilename(title: string, extension: string) {
  const safe = sanitizeFileStem(title || "book");
  return `${safe}${extension}`;
}

function copyHeader(source: Headers, target: Headers, name: string) {
  const value = source.get(name);
  if (value) target.set(name, value);
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

  if (!book.bookBlobUrl) {
    return NextResponse.json({ error: "Book file is unavailable." }, { status: 404 });
  }

  try {
    const headers = new Headers();
    const range = request.headers.get("range");
    if (range) headers.set("range", range);

    const blobResponse = await fetch(book.bookBlobUrl, {
      method: headOnly ? "HEAD" : "GET",
      headers,
      cache: "no-store",
    });

    if (!blobResponse.ok && blobResponse.status !== 206 && blobResponse.status !== 416) {
      devLog("blob-fetch-failed", { slug: decodedSlug, status: blobResponse.status, range });
      return NextResponse.json({ error: "Book file is unavailable." }, { status: blobResponse.status === 404 ? 404 : 502 });
    }

    const extension = path.extname(book.bookBlobPath) || (book.format === "PDF" ? ".pdf" : ".epub");
    const filename = dispositionFilename(book.title, extension);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const disposition = download ? "attachment" : "inline";
    const responseHeaders = new Headers({
      "Accept-Ranges": blobResponse.headers.get("accept-ranges") ?? "bytes",
      "Content-Type": book.fileContentType || blobResponse.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    });

    copyHeader(blobResponse.headers, responseHeaders, "content-length");
    copyHeader(blobResponse.headers, responseHeaders, "content-range");
    copyHeader(blobResponse.headers, responseHeaders, "etag");
    copyHeader(blobResponse.headers, responseHeaders, "last-modified");

    devLog(blobResponse.status === 206 ? "partial-content" : "full-content", {
      slug: decodedSlug,
      status: blobResponse.status,
      range,
      headOnly,
    });

    return new Response(headOnly ? null : blobResponse.body, {
      status: blobResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    devLog("blob-error", {
      slug: decodedSlug,
      message: error instanceof Error ? error.message : String(error),
      blobPath: book.bookBlobPath,
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
