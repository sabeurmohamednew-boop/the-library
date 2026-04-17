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

  return NextResponse.redirect(book.coverBlobUrl, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
