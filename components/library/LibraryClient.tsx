"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { trackResumeClick } from "@/lib/analytics";
import { BOOK_CATEGORIES, BOOK_FORMATS, LIBRARY_PAGE_SIZE } from "@/lib/config";
import { getReaderStatesForLibrary, loadBookmarkedSlugs } from "@/lib/clientStorage";
import { displayBookTitle } from "@/lib/bookDisplay";
import { normalizeSearch } from "@/lib/text";
import type { ReaderState } from "@/lib/types";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookCover } from "@/components/library/BookCover";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { IndexedLibraryBook, ListMode, SortMode, ViewMode } from "@/components/library/libraryViewTypes";

const InteractiveLibraryResults = dynamic(
  () => import("@/components/library/InteractiveLibraryResults").then((mod) => mod.InteractiveLibraryResults),
  {
    ssr: false,
    loading: () => <div className="gallery-grid skeleton-grid" aria-hidden="true" />,
  },
);

type LibraryClientProps = {
  books: IndexedLibraryBook[];
  initialBrowse: ReactNode;
};

function scheduleClientStateLoad(callback: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(callback, { timeout: 900 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, 1);
  return () => globalThis.clearTimeout(id);
}

function countResults(
  books: IndexedLibraryBook[],
  {
    query,
    format,
    category,
    bookmarkedOnly,
    bookmarkedSlugs,
  }: {
    query: string;
    format: string;
    category: string;
    bookmarkedOnly: boolean;
    bookmarkedSlugs: Set<string>;
  },
) {
  return books.filter((book) => {
    if (format && book.format !== format) return false;
    if (category && book.category !== category) return false;
    if (bookmarkedOnly && !bookmarkedSlugs.has(book.slug)) return false;
    if (!query) return true;
    return book.searchText.includes(query);
  }).length;
}

export function LibraryClient({ books, initialBrowse }: LibraryClientProps) {
  const [view, setView] = useState<ViewMode>("gallery");
  const [listMode, setListMode] = useState<ListMode>("titles");
  const [sort, setSort] = useState<SortMode>("title-asc");
  const [format, setFormat] = useState("");
  const [category, setCategory] = useState("");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState<number>(LIBRARY_PAGE_SIZE.gallery);
  const [readerStates, setReaderStates] = useState<Map<string, ReaderState>>(new Map());
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<Set<string>>(new Set());
  const [clientStateReady, setClientStateReady] = useState(false);
  const [resultsActivated, setResultsActivated] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    return scheduleClientStateLoad(() => {
      setReaderStates(getReaderStatesForLibrary());
      setBookmarkedSlugs(loadBookmarkedSlugs());
      setClientStateReady(true);
    });
  }, []);

  useEffect(() => {
    setVisibleCount(LIBRARY_PAGE_SIZE[view]);
  }, [view, sort, format, category, bookmarkedOnly, deferredSearch]);

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

  const recentBooks = useMemo(() => {
    if (!clientStateReady) return [];

    return books
      .filter((book) => (readerStates.get(book.slug)?.progress ?? 0) > 0)
      .sort((a, b) => {
        const aOpened = readerStates.get(a.slug)?.lastOpenedAt ?? "";
        const bOpened = readerStates.get(b.slug)?.lastOpenedAt ?? "";
        return new Date(bOpened).getTime() - new Date(aOpened).getTime();
      })
      .slice(0, 6);
  }, [books, clientStateReady, readerStates]);

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

  const activeResultsCount = useMemo(() => {
    if (!resultsActivated) return books.length;

    return countResults(books, {
      query: normalizeSearch(deferredSearch),
      format,
      category,
      bookmarkedOnly,
      bookmarkedSlugs,
    });
  }, [bookmarkedOnly, bookmarkedSlugs, books, category, deferredSearch, format, resultsActivated]);

  const canLoadMore = view !== "list" && visibleCount < activeResultsCount;
  const showInitialBrowse = !resultsActivated && view === "gallery" && sort === "title-asc" && !format && !category && !bookmarkedOnly && !deferredSearch.trim();

  function activateResults() {
    setResultsActivated(true);
  }

  function resumeDetailFor(book: IndexedLibraryBook) {
    const state = readerStates.get(book.slug);
    if (!state) return "";
    if (state.locationLabel) return state.locationLabel;
    return `${Math.round((state.progress ?? 0) * 100)}%`;
  }

  function resetSearchAndFilters() {
    setSearch("");
    setFormat("");
    setCategory("");
    setBookmarkedOnly(false);
    setResultsActivated(true);
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

            <div className="library-primary-search search-wrap">
              <Search aria-hidden="true" />
              <input
                ref={searchRef}
                className="field"
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setResultsActivated(true);
                }}
                placeholder="Search title, author, or description"
                aria-label="Search books"
              />
            </div>
          </div>
        </div>
      </header>

      <section className="toolbar library-filterbar" aria-label="Library controls">
        <div className="toolbar-filters">
          <select
            className="select"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortMode);
              activateResults();
            }}
            aria-label="Sort books"
          >
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
            <option value="publication-desc">Publication date newest</option>
            <option value="publication-asc">Publication date oldest</option>
            <option value="upload-desc">Upload date newest</option>
            <option value="upload-asc">Upload date oldest</option>
          </select>

          <select
            className="select"
            value={format}
            onChange={(event) => {
              setFormat(event.target.value);
              activateResults();
            }}
            aria-label="Filter by format"
          >
            <option value="">All formats</option>
            {BOOK_FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              activateResults();
            }}
            aria-label="Filter by category"
          >
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
              onChange={(event) => {
                setBookmarkedOnly(event.target.checked);
                activateResults();
              }}
            />
            Bookmarked only
          </label>

          <span className="results-count">
            {activeResultsCount.toLocaleString()} {activeResultsCount === 1 ? "result" : "results"}
          </span>
        </div>

        <div className="toolbar-views">
          <div className="segmented" role="group" aria-label="Choose library view">
            {(["gallery", "list", "cover"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={view === mode ? "segmented-button active" : "segmented-button"}
                onClick={() => {
                  setView(mode);
                  activateResults();
                }}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!clientStateReady ? (
        <section className="continue-section continue-section-pending" aria-labelledby="recent-heading" aria-busy="true">
          <div className="section-heading">
            <h2 id="recent-heading">Continue reading</h2>
            <span className="muted small">Pick up where you left off</span>
          </div>
          <div className="continue-card-grid" aria-hidden="true">
            <article className="continue-card continue-card-skeleton">
              <span className="continue-cover cover-link skeleton" />
              <div className="continue-card-body">
                <span className="skeleton skeleton-line continue-kicker-skeleton" />
                <span className="skeleton skeleton-line continue-title-skeleton" />
                <span className="skeleton skeleton-line continue-author-skeleton" />
                <span className="skeleton skeleton-line continue-progress-skeleton" />
                <span className="skeleton continue-button-skeleton" />
              </div>
            </article>
            <article className="continue-card continue-card-skeleton">
              <span className="continue-cover cover-link skeleton" />
              <div className="continue-card-body">
                <span className="skeleton skeleton-line continue-kicker-skeleton" />
                <span className="skeleton skeleton-line continue-title-skeleton" />
                <span className="skeleton skeleton-line continue-author-skeleton" />
                <span className="skeleton skeleton-line continue-progress-skeleton" />
                <span className="skeleton continue-button-skeleton" />
              </div>
            </article>
          </div>
        </section>
      ) : recentBooks.length > 0 ? (
        <section className="continue-section" aria-labelledby="recent-heading">
          <div className="section-heading">
            <h2 id="recent-heading">Continue reading</h2>
            <span className="muted small">Pick up where you left off</span>
          </div>
          <div className="continue-card-grid">
            {recentBooks.map((book, index) => {
              const state = readerStates.get(book.slug);
              const progress = Math.max(0, Math.min(1, state?.progress ?? 0));
              const resumeDetail = resumeDetailFor(book);
              const bookTitle = displayBookTitle(book.title);

              return (
                <article key={book.slug} className="continue-card">
                  <Link
                    className="continue-cover cover-link"
                    href={`/read/${book.slug}`}
                    aria-label={`Resume ${bookTitle}`}
                    prefetch={false}
                    onClick={() => trackResumeClick(book, progress)}
                  >
                    <BookCover
                      book={{ slug: book.slug, title: bookTitle, format: book.format, coverBlobPath: book.coverBlobPath, updatedAt: book.updatedAt }}
                      priority={index === 0}
                      sizes="(max-width: 560px) 72px, (max-width: 860px) 92px, 110px"
                    />
                  </Link>
                  <div className="continue-card-body">
                    <p className="continue-kicker">{book.format}</p>
                    <h3>
                      <Link href={`/books/${book.slug}`} prefetch={false}>
                        {bookTitle}
                      </Link>
                    </h3>
                    <AuthorLinks author={book.author} authors={book.authors} className="continue-authors" prefix="By " />
                    <div className="continue-progress" aria-label={resumeDetail ? `Saved position ${resumeDetail}` : "Saved reading position"}>
                      <span>{resumeDetail || "Saved position"}</span>
                      <span className="continue-progress-track" aria-hidden="true">
                        <span className="continue-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                      </span>
                    </div>
                    <Link className="button primary continue-resume" href={`/read/${book.slug}`} prefetch={false} onClick={() => trackResumeClick(book, progress)}>
                      Resume
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
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
      )}

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
                onClick={() => {
                  setListMode("titles");
                  activateResults();
                }}
              >
                Titles
              </button>
              <button
                type="button"
                className={listMode === "authors" ? "segmented-button active" : "segmented-button"}
                onClick={() => {
                  setListMode("authors");
                  activateResults();
                }}
              >
                Authors
              </button>
            </div>
          ) : null}
        </div>

        {showInitialBrowse ? (
          initialBrowse
        ) : (
          <InteractiveLibraryResults
            books={books}
            view={view}
            listMode={listMode}
            sort={sort}
            format={format}
            category={category}
            bookmarkedOnly={bookmarkedOnly}
            search={deferredSearch}
            visibleCount={visibleCount}
            readerStates={readerStates}
            bookmarkedSlugs={bookmarkedSlugs}
            onReset={resetSearchAndFilters}
          />
        )}

        {canLoadMore ? (
          <div className="section-heading">
            <span className="muted small">
              Showing {Math.min(visibleCount, activeResultsCount).toLocaleString()} of {activeResultsCount.toLocaleString()}
            </span>
            <button
              className="button"
              type="button"
              onClick={() => {
                setResultsActivated(true);
                setVisibleCount((count) => count + LIBRARY_PAGE_SIZE[view]);
              }}
            >
              Load more
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
