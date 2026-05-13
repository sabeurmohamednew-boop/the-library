import type { Metadata } from "next";
import { LibraryClient } from "@/components/library/LibraryClient";
import { LibraryInitialBrowse } from "@/components/library/LibraryInitialBrowse";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetAllLibraryBooks } from "@/lib/books";
import { bookAuthors } from "@/lib/authors";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo";
import { normalizeSearch } from "@/lib/text";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: SITE_TITLE,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default async function HomePage() {
  const result = await safeGetAllLibraryBooks();

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The Library could not load." adminHref="/admin" />;
  }

  const books = result.data
    .map((book) => ({
      ...book,
      searchText: normalizeSearch(`${book.title} ${book.author} ${bookAuthors(book).join(" ")} ${book.description}`),
      publicationTime: new Date(book.publicationDate).getTime(),
      uploadTime: new Date(book.uploadDate).getTime(),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return <LibraryClient books={books} initialBrowse={<LibraryInitialBrowse books={books} />} />;
}
