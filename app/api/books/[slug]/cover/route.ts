import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const book = await getBookBySlug(decodeURIComponent(slug));

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
