import { LibraryClient } from "@/components/library/LibraryClient";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetAllBooks } from "@/lib/books";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await safeGetAllBooks();

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The Library could not load." adminHref="/admin" />;
  }

  return <LibraryClient books={result.data} />;
}
