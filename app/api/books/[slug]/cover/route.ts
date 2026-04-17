import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getBookBySlug } from "@/lib/books";
import { contentTypeForPath, getStorageFileInfo, resolveStoragePath } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const book = await getBookBySlug(decodeURIComponent(slug));

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  try {
    const filePath = resolveStoragePath(book.coverImagePath);
    const info = await getStorageFileInfo(book.coverImagePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

    return new Response(stream, {
      headers: {
        "Content-Type": contentTypeForPath(book.coverImagePath),
        "Content-Length": info.size.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Cover not found." }, { status: 404 });
  }
}
