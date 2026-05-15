import { NextResponse } from "next/server";
import { getBookCoverBySlug } from "@/lib/books";
import { findLocalCoverFile, localNodeFileReadableStream } from "@/lib/localFiles";
import { getR2Object, r2ConfigError } from "@/lib/r2";
import { logRuntimeFailure, runtimeFailure } from "@/lib/runtime";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

const COVER_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "CDN-Cache-Control": "max-age=31536000",
  "Vercel-CDN-Cache-Control": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
};

const ERROR_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function coverError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: ERROR_HEADERS });
}

function logCoverSource(slug: string, source: "api-r2-proxy" | "local-development-fallback") {
  if (process.env.NODE_ENV === "production") return;
  console.info("[book-cover] source", { slug, source });
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  let book;

  try {
    book = await getBookCoverBySlug(decodedSlug);
  } catch (error) {
    const failure = runtimeFailure("book-cover.lookup", error);
    logRuntimeFailure(failure, { slug: decodedSlug });
    return coverError(failure.userMessage, 503);
  }

  if (!book?.coverBlobPath) {
    return coverError("Cover not found.", 404);
  }

  const r2Error = r2ConfigError();
  if (!r2Error) {
    try {
      const r2Cover = await getR2Object(book.coverBlobPath);
      if (r2Cover) {
        const contentType = r2Cover.contentType || book.coverContentType || "image/jpeg";
        if (!contentType.toLowerCase().startsWith("image/")) {
          return coverError("Cover response was not an image.", 502);
        }

        const headers = new Headers({
          "Content-Type": contentType,
          ...COVER_CACHE_HEADERS,
        });
        if (r2Cover.contentLength !== undefined) headers.set("Content-Length", String(r2Cover.contentLength));
        if (r2Cover.etag) headers.set("ETag", r2Cover.etag);
        if (r2Cover.lastModified) headers.set("Last-Modified", r2Cover.lastModified.toUTCString());

        logCoverSource(decodedSlug, "api-r2-proxy");
        return new NextResponse(r2Cover.body, { status: 200, headers });
      }
    } catch (error) {
      console.error("[book-cover] r2-fetch-failed", {
        at: new Date().toISOString(),
        slug: decodedSlug,
        key: book.coverBlobPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (process.env.NODE_ENV !== "production") {
    console.info("[book-cover] r2-not-configured", { at: new Date().toISOString(), slug: decodedSlug, missing: r2Error });
  }

  const localCover = await findLocalCoverFile(book);
  if (localCover) {
    logCoverSource(decodedSlug, "local-development-fallback");
    return new NextResponse(localNodeFileReadableStream(localCover.path), {
      status: 200,
      headers: {
        "Content-Type": book.coverContentType || "image/jpeg",
        "Content-Length": String(localCover.size),
        "Last-Modified": localCover.mtime.toUTCString(),
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return coverError("Cover image could not be loaded.", 404);
}
