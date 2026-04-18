"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS, LIBRARY_PAGE_SIZE } from "@/lib/config";
import { getReaderStatesForLibrary, loadBookmarkedSlugs } from "@/lib/clientStorage";
import { authorPath, bookAuthors, buildAuthorRows } from "@/lib/authors";
import { normalizeSearch } from "@/lib/text";
import type { BookDTO, ReaderState } from "@/lib/types";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookCard } from "@/components/library/BookCard";
import { BookCover } from "@/components/library/BookCover";
import { ThemeToggle } from "@/components/ThemeToggle";

type ViewMode = "gallery" | "list" | "cover";
type ListMode = "titles" | "authors";
type SortMode =
  | "title-asc"
  | "title-desc"
  | "publication-desc"
  | "publication-asc"
  | "upload-desc"
  | "upload-asc";

type LibraryClientProps = {
  books: BookDTO[];
};

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function LibraryClient({ books }: LibraryClientProps) {
  const [view, setView] = useState<ViewMode>("gallery");
  const [listMode, setListMode] = useState<ListMode>("titles");
  const [sort, setSort] = useState<SortMode>("title-asc");
  const [format, setFormat] = useState("");
  const [category, setCategory] = useState("");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState<number>(LIBRARY_PAGE_SIZE.gallery);
  const [readerStates, setReaderStates] = useState<Map<string, ReaderState>>(new Map());
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<Set<string>>(new Set());
  const [clientStateReady, setClientStateReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useClientLayoutEffect(() => {
    setReaderStates(getReaderStatesForLibrary());
    setBookmarkedSlugs(loadBookmarkedSlugs());
    setClientStateReady(true);
  }, []);

  useEffect(() => {
    setVisibleCount(LIBRARY_PAGE_SIZE[view]);
  }, [view, sort, format, category, bookmarkedOnly, debouncedSearch]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredBooks = useMemo(() => {
    const query = normalizeSearch(debouncedSearch);

    return books
      .filter((book) => {
        if (format && book.format !== format) return false;
        if (category && book.category !== category) return false;
        if (bookmarkedOnly && !bookmarkedSlugs.has(book.slug)) return false;

        if (!query) return true;
        const authorText = bookAuthors(book).join(" ");
        const haystack = `${book.title} ${book.author} ${authorText} ${book.description}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        switch (sort) {
          case "title-desc":
            return b.title.localeCompare(a.title);
          case "publication-desc":
            return new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime();
          case "publication-asc":
            return new Date(a.publicationDate).getTime() - new Date(b.publicationDate).getTime();
          case "upload-desc":
            return new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime();
          case "upload-asc":
            return new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
          case "title-asc":
          default:
            return a.title.localeCompare(b.title);
        }
      });
  }, [books, bookmarkedOnly, bookmarkedSlugs, category, debouncedSearch, format, sort]);

  const recentBooks = useMemo(() => {
    return books
      .filter((book) => (readerStates.get(book.slug)?.progress ?? 0) > 0)
      .sort((a, b) => {
        const aOpened = readerStates.get(a.slug)?.lastOpenedAt ?? "";
        const bOpened = readerStates.get(b.slug)?.lastOpenedAt ?? "";
        return new Date(bOpened).getTime() - new Date(aOpened).getTime();
      })
      .slice(0, 6);
  }, [books, readerStates]);

  const visibleBooks = filteredBooks.slice(0, visibleCount);
  const canLoadMore = visibleCount < filteredBooks.length;
  const hasActiveFilters = Boolean(debouncedSearch.trim() || format || category || bookmarkedOnly);
  const hasAnyBookBookmarks = bookmarkedSlugs.size > 0;
  const noBookmarkedBooks = bookmarkedOnly && !hasAnyBookBookmarks;

  const authorRows = useMemo(() => {
    return buildAuthorRows(filteredBooks);
  }, [filteredBooks]);

  const browseCopy = {
    gallery: {
      title: "Browse library",
      description: "Book cards with context, metadata, and quick actions.",
    },
    list: {
      title: listMode === "authors" ? "Authors" : "Titles",
      description: listMode === "authors" ? "Scan authors and jump into their books." : "A compact view for comparing books quickly.",
    },
    cover: {
      title: "Cover shelf",
      description: "A denser visual shelf for browsing by cover.",
    },
  }[view];

  function resumeDetailFor(book: BookDTO) {
    const state = readerStates.get(book.slug);
    if (!state) return "";
    if (state.locationLabel) return state.locationLabel;
    return `${Math.round((state.progress ?? 0) * 100)}%`;
  }

  function resetSearchAndFilters() {
    setSearch("");
    setDebouncedSearch("");
    setFormat("");
    setCategory("");
    setBookmarkedOnly(false);
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

        <div className="library-primary-search search-wrap">
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            className="field"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, author, or description"
            aria-label="Search books"
          />
        </div>
      </header>

      <section className="toolbar library-filterbar" aria-label="Library controls">
        <div className="toolbar-filters">
          <select className="select" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="Sort books">
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
            <option value="publication-desc">Publication date newest</option>
            <option value="publication-asc">Publication date oldest</option>
            <option value="upload-desc">Upload date newest</option>
            <option value="upload-asc">Upload date oldest</option>
          </select>

          <select className="select" value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Filter by format">
            <option value="">All formats</option>
            {BOOK_FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select className="select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {BOOK_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <label className="chip">
            <input
              type="checkbox"
              checked={bookmarkedOnly}
              onChange={(event) => setBookmarkedOnly(event.target.checked)}
            />
            Bookmarked only
          </label>

          <span className="results-count">
            {filteredBooks.length.toLocaleString()} {filteredBooks.length === 1 ? "result" : "results"}
          </span>
        </div>

        <div className="toolbar-views">
          <div className="segmented" role="group" aria-label="Choose library view">
            {(["gallery", "list", "cover"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={view === mode ? "segmented-button active" : "segmented-button"}
                onClick={() => setView(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {recentBooks.length > 0 ? (
        <section className="continue-section" aria-labelledby="recent-heading">
          <div className="section-heading">
            <h2 id="recent-heading">Continue reading</h2>
            <span className="muted small">Pick up where you left off</span>
          </div>
          <div className="continue-card-grid">
            {recentBooks.map((book) => {
              const state = readerStates.get(book.slug);
              const progress = Math.max(0, Math.min(1, state?.progress ?? 0));
              const resumeDetail = resumeDetailFor(book);

              return (
                <article key={book.slug} className="continue-card">
                  <Link className="continue-cover cover-link" href={`/read/${book.slug}`} aria-label={`Resume ${book.title}`} prefetch={false}>
                    <BookCover book={book} />
                  </Link>
                  <div className="continue-card-body">
                    <p className="continue-kicker">{book.format}</p>
                    <h3>
                      <Link href={`/books/${book.slug}`} prefetch={false}>
                        {book.title}
                      </Link>
                    </h3>
                    <AuthorLinks author={book.author} authors={book.authors} className="continue-authors" prefix="By " />
                    <div className="continue-progress" aria-label={resumeDetail ? `Saved position ${resumeDetail}` : "Saved reading position"}>
                      <span>{resumeDetail || "Saved position"}</span>
                      <span className="continue-progress-track" aria-hidden="true">
                        <span className="continue-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </span>
                    </div>
                    <Link className="button primary continue-resume" href={`/read/${book.slug}`} prefetch={false}>
                      Resume
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : clientStateReady ? (
        <section className="continue-section continue-empty-section" aria-labelledby="recent-heading">
          <div className="section-heading">
            <h2 id="recent-heading">Continue reading</h2>
            <span className="muted small">Your next read will appear here</span>
          </div>
          <div className="empty-state empty-state-feature">
            <span className="empty-state-mark" aria-hidden="true">
              Read
            </span>
            <div>
              <h3>{books.length === 0 ? "Add a book to begin." : "Start a book to save your place."}</h3>
              <p>{books.length === 0 ? "Books you add will appear below for browsing, reading, and returning later." : "Open any book and The Library will remember where you left off."}</p>
            </div>
            {books.length > 0 ? (
              <a className="button primary" href="#browse-heading">
                Browse books
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={`browse-section browse-section-${view}`} aria-labelledby="browse-heading" aria-live="polite" aria-busy={false}>
        <div className="section-heading browse-heading">
          <div>
            <h2 id="browse-heading">{browseCopy.title}</h2>
            <p className="muted small">{browseCopy.description}</p>
          </div>
          {view === "list" ? (
            <div className="segmented" role="group" aria-label="Choose list mode">
              <button
                type="button"
                className={listMode === "titles" ? "segmented-button active" : "segmented-button"}
                onClick={() => setListMode("titles")}
              >
                Titles
              </button>
              <button
                type="button"
                className={listMode === "authors" ? "segmented-button active" : "segmented-button"}
                onClick={() => setListMode("authors")}
              >
                Authors
              </button>
            </div>
          ) : null}
        </div>

        {filteredBooks.length === 0 ? (
          <div className="empty-state empty-state-card library-empty-state">
            <span className="empty-state-mark" aria-hidden="true">
              {books.length === 0 ? "Books" : noBookmarkedBooks ? "Save" : "Search"}
            </span>
            <h3>{books.length === 0 ? "Your library is ready for books." : noBookmarkedBooks ? "No bookmarked books yet." : "No books match this view."}</h3>
            <p>
              {books.length === 0
                ? "Once books are added, they will appear here for browsing and reading."
                : noBookmarkedBooks
                  ? "Bookmark a book from its detail page or save a reader location to keep it close."
                  : "Try a broader search, choose fewer filters, or return to the full library."}
            </p>
            {hasActiveFilters ? (
              <button className="button primary" type="button" onClick={resetSearchAndFilters}>
                Reset search and filters
              </button>
            ) : null}
          </div>
        ) : view === "gallery" ? (
          <div className="gallery-grid">
            {visibleBooks.map((book) => (
              <BookCard key={book.slug} book={book} started={(readerStates.get(book.slug)?.progress ?? 0) > 0} />
            ))}
          </div>
        ) : view === "cover" ? (
          <div className="cover-grid">
            {visibleBooks.map((book) => (
              <Link key={book.slug} className="cover-link" href={`/books/${book.slug}`} aria-label={`Open details for ${book.title}`} prefetch={false}>
                <BookCover book={book} />
              </Link>
            ))}
          </div>
        ) : listMode === "titles" ? (
          <div className="library-list book-list">
            {visibleBooks.map((book) => (
              <Link key={book.slug} className="title-list-item" href={`/books/${book.slug}`} title={book.title} prefetch={false}>
                <span className="title-list-title">{book.title}</span>
                <span className="title-list-meta" aria-label={`${book.format}, ${book.pageCount.toLocaleString()} pages`}>
                  <span className="title-list-format">{book.format}</span>
                  <span>{book.pageCount.toLocaleString()} pages</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="library-list author-list">
            {authorRows.slice(0, visibleCount).map(({ author, count }) => (
              <Link key={authorPath(author)} className="list-item author-list-item" href={authorPath(author)} aria-label={`View books by ${author}`} prefetch={false}>
                <span>{author}</span>
                <span className="muted small">
                  {count} {count === 1 ? "book" : "books"}
                </span>
              </Link>
            ))}
          </div>
        )}

        {canLoadMore && view !== "list" ? (
          <div className="section-heading">
            <span className="muted small">
              Showing {visibleBooks.length.toLocaleString()} of {filteredBooks.length.toLocaleString()}
            </span>
            <button className="button" type="button" onClick={() => setVisibleCount((count) => count + LIBRARY_PAGE_SIZE[view])}>
              Load more
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
