import { NextResponse } from "next/server";
import { bookAuthors } from "@/lib/authors";
import { safeGetAllLibraryBooks } from "@/lib/books";
import { normalizeSearch } from "@/lib/text";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await safeGetAllLibraryBooks();

  if (!result.ok) {
    return NextResponse.json({ error: "Library books could not be loaded." }, { status: 500 });
  }

  const books = result.data
    .map((book) => ({
      ...book,
      searchText: normalizeSearch(`${book.title} ${book.author} ${bookAuthors(book).join(" ")} ${book.description}`),
      publicationTime: new Date(book.publicationDate).getTime(),
      uploadTime: new Date(book.uploadDate).getTime(),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return NextResponse.json(
    { books },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
