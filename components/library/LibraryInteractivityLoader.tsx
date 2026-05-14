"use client";

import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
import { Search } from "lucide-react";
import type { IndexedLibraryBook } from "@/components/library/libraryViewTypes";

type LibraryInteractivityLoaderProps = {
  totalCount: number;
  initialBrowse: ReactNode;
};

type InteractiveLibraryProps = {
  books: IndexedLibraryBook[];
  chrome?: boolean;
  initialResultsActivated?: boolean;
  initialVisibleCount?: number;
  initialSearch?: string;
};

type LibraryBooksResponse = {
  books: IndexedLibraryBook[];
};

export function LibraryInteractivityLoader({ totalCount, initialBrowse }: LibraryInteractivityLoaderProps) {
  const [books, setBooks] = useState<IndexedLibraryBook[] | null>(null);
  const [InteractiveLibrary, setInteractiveLibrary] = useState<ComponentType<InteractiveLibraryProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const [activatedSearch, setActivatedSearch] = useState("");

  async function activateLibrary(search = pendingSearch) {
    const nextSearch = search.trim();
    setActivatedSearch(nextSearch);
    if (books || loading) return;

    setLoading(true);
    setError("");

    try {
      const [response, module] = await Promise.all([
        fetch("/api/library/books", {
          headers: { Accept: "application/json" },
        }),
        import("@/components/library/LibraryClient"),
      ]);

      if (!response.ok) throw new Error("Library data could not be loaded.");

      const payload = (await response.json()) as LibraryBooksResponse;
      setBooks(payload.books);
      setInteractiveLibrary(() => module.LibraryClient);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Library data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  if (books && InteractiveLibrary) {
    return (
      <InteractiveLibrary
        books={books}
        chrome={false}
        initialResultsActivated
        initialVisibleCount={24}
        initialSearch={activatedSearch}
      />
    );
  }

  return (
    <section className="browse-section browse-section-gallery" aria-labelledby="browse-heading">
      <div className="section-heading browse-heading">
        <div>
          <h2 id="browse-heading">Browse library</h2>
          <p className="muted small">Showing the first 12 books. Search, filters, alternate views, and more books load on demand.</p>
        </div>
        <button className="button" type="button" onClick={() => void activateLibrary()} disabled={loading} aria-busy={loading}>
          {loading ? "Loading..." : "Search, filter, and load more"}
        </button>
      </div>

      <form
        className="library-activation-search search-wrap"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void activateLibrary(pendingSearch);
        }}
      >
        <Search aria-hidden="true" />
        <input
          className="field"
          type="search"
          value={pendingSearch}
          onChange={(event) => setPendingSearch(event.target.value)}
          placeholder="Search title, author, or description"
          aria-label="Search books"
        />
      </form>

      {initialBrowse}

      {totalCount > 12 ? (
        <div className="section-heading">
          <span className="muted small">
            Showing 12 of {totalCount.toLocaleString()}. Continue below for more books.
          </span>
          <button className="button" type="button" onClick={() => void activateLibrary()} disabled={loading} aria-busy={loading}>
            {loading ? "Loading..." : "Load more books"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="muted small" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
