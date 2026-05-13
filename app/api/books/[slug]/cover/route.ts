import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";
import { findLocalCoverFile, localNodeFileReadableStream } from "@/lib/localFiles";
import { getR2Object, r2ConfigError } from "@/lib/r2";
import { logRuntimeFailure, runtimeFailure } from "@/lib/runtime";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  let book;

  try {
    book = await getBookBySlug(decodedSlug);
  } catch (error) {
    const failure = runtimeFailure("book-cover.lookup", error);
    logRuntimeFailure(failure, { slug: decodedSlug });
    return NextResponse.json({ error: failure.userMessage }, { status: 503 });
  }

  if (!book?.coverBlobPath) {
    return NextResponse.json({ error: "Cover not found." }, { status: 404 });
  }

  const r2Error = r2ConfigError();
  if (!r2Error) {
    try {
      const r2Cover = await getR2Object(book.coverBlobPath);
      if (r2Cover) {
        const contentType = r2Cover.contentType || book.coverContentType || "image/jpeg";
        if (!contentType.toLowerCase().startsWith("image/")) {
          return NextResponse.json({ error: "Cover response was not an image." }, { status: 502 });
        }

        const headers = new Headers({
          "Content-Type": contentType,
          "Cache-Control": "no-store, max-age=0",
        });
        if (r2Cover.contentLength !== undefined) headers.set("Content-Length", String(r2Cover.contentLength));
        if (r2Cover.etag) headers.set("ETag", r2Cover.etag);
        if (r2Cover.lastModified) headers.set("Last-Modified", r2Cover.lastModified.toUTCString());

        return new NextResponse(r2Cover.body, { status: 200, headers });
      }
    } catch (error) {
      console.info("[book-cover] r2-fetch-failed", {
        at: new Date().toISOString(),
        slug: decodedSlug,
        key: book.coverBlobPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    console.info("[book-cover] r2-not-configured", { at: new Date().toISOString(), slug: decodedSlug, missing: r2Error });
  }

  const localCover = await findLocalCoverFile(book);
  if (localCover) {
    return new NextResponse(localNodeFileReadableStream(localCover.path), {
      status: 200,
      headers: {
        "Content-Type": book.coverContentType || "image/jpeg",
        "Content-Length": String(localCover.size),
        "Last-Modified": localCover.mtime.toUTCString(),
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  return NextResponse.json({ error: "Cover image could not be loaded." }, { status: 404 });
}
