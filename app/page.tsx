import type { Metadata } from "next";
import { LibraryInitialBrowse } from "@/components/library/LibraryInitialBrowse";
import { LibraryInteractivityLoader } from "@/components/library/LibraryInteractivityLoader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetLibraryHomeBooks } from "@/lib/books";
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
  const result = await safeGetLibraryHomeBooks(12);

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The Library could not load." adminHref="/admin" />;
  }

  const initialBooks = result.data.books
    .map((book) => ({
      ...book,
      searchText: normalizeSearch(`${book.title} ${book.author} ${bookAuthors(book).join(" ")} ${book.description}`),
      publicationTime: new Date(book.publicationDate).getTime(),
      uploadTime: new Date(book.uploadDate).getTime(),
    }));

  return (
    <main className="site-shell library-home" id="main">
      <header className="library-header">
        <div className="library-header-main">
          <div className="library-header-copy">
            <h1 className="site-title">The Library</h1>
            <p className="library-subtitle">Find a book, save your place, and return when the page calls you back.</p>
          </div>
          <div className="library-header-actions">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <LibraryInteractivityLoader totalCount={result.data.totalCount} initialBrowse={<LibraryInitialBrowse books={initialBooks} />} />
    </main>
  );
}
