import { LibraryClient } from "@/components/library/LibraryClient";
import { getAllBooks } from "@/lib/books";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const books = await getAllBooks();

  return <LibraryClient books={books} />;
}
