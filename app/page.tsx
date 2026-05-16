import type { Metadata } from "next";
import { LibraryInitialBrowse } from "@/components/library/LibraryInitialBrowse";
import { LibraryInteractivityLoader } from "@/components/library/LibraryInteractivityLoader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetLibraryHomeBooks } from "@/lib/books";
import { LIBRARY_HOME_INITIAL_COUNT } from "@/lib/libraryConfig";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo";

export const revalidate = 300;

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
  const result = await safeGetLibraryHomeBooks(LIBRARY_HOME_INITIAL_COUNT);

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The Library could not load." adminHref="/admin" />;
  }

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

      <LibraryInteractivityLoader
        totalCount={result.data.totalCount}
        initialCount={result.data.books.length}
        initialBrowse={<LibraryInitialBrowse books={result.data.books} />}
      />

      <footer className="library-support" aria-label="Support The Library">
        <p>The Library is free and ad-free. Donations help cover hosting, storage, and bandwidth.</p>
        <a
          className="button tertiary library-support-link"
          href="https://ko-fi.com/thelibraryalpha"
          target="_blank"
          rel="noopener noreferrer"
        >
          Support the library
        </a>
      </footer>
    </main>
  );
}
