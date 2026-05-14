"use client";

import type { ComponentType, ReactNode } from "react";
import { useState } from "react";
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
};

type LibraryBooksResponse = {
  books: IndexedLibraryBook[];
};

export function LibraryInteractivityLoader({ totalCount, initialBrowse }: LibraryInteractivityLoaderProps) {
  const [books, setBooks] = useState<IndexedLibraryBook[] | null>(null);
  const [InteractiveLibrary, setInteractiveLibrary] = useState<ComponentType<InteractiveLibraryProps> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function activateLibrary() {
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
        <button className="button" type="button" onClick={activateLibrary} disabled={loading} aria-busy={loading}>
          {loading ? "Loading..." : "Search, filter, and load more"}
        </button>
      </div>

      {initialBrowse}

      {totalCount > 12 ? (
        <div className="section-heading">
          <span className="muted small">
            Showing 12 of {totalCount.toLocaleString()}
          </span>
          <button className="button" type="button" onClick={activateLibrary} disabled={loading} aria-busy={loading}>
            {loading ? "Loading..." : "Load more"}
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
