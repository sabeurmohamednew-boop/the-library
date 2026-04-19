import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";
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

  if (!book?.coverBlobUrl) {
    return NextResponse.json({ error: "Cover not found." }, { status: 404 });
  }

  let coverResponse: Response;

  try {
    coverResponse = await fetch(book.coverBlobUrl, { cache: "no-store" });
  } catch (error) {
    const failure = runtimeFailure("book-cover.fetch", error);
    logRuntimeFailure(failure, { slug: decodedSlug });
    return NextResponse.json({ error: "Cover image could not be loaded." }, { status: 502 });
  }

  if (!coverResponse.ok || !coverResponse.body) {
    return NextResponse.json({ error: "Cover image could not be loaded." }, { status: 502 });
  }
  const contentType = coverResponse.headers.get("content-type") || book.coverContentType || "image/jpeg";

  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Cover response was not an image." }, { status: 502 });
  }

  return new NextResponse(coverResponse.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
