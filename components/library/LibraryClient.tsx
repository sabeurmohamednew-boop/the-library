"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS, LIBRARY_PAGE_SIZE, categoryLabel } from "@/lib/config";
import { getReaderStatesForLibrary, loadBookmarkedSlugs } from "@/lib/clientStorage";
import { authorPath, bookAuthors, buildAuthorRows } from "@/lib/authors";
import { formatDate, normalizeSearch } from "@/lib/text";
import type { BookDTO, ReaderState } from "@/lib/types";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookCard } from "@/components/library/BookCard";
import { BookCover } from "@/components/library/BookCover";

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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setReaderStates(getReaderStatesForLibrary());
    setBookmarkedSlugs(loadBookmarkedSlugs());
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

  const authorRows = useMemo(() => {
    return buildAuthorRows(filteredBooks);
  }, [filteredBooks]);

  function resumeDetailFor(book: BookDTO) {
    const state = readerStates.get(book.slug);
    if (!state) return "";
    if (state.locationLabel) return state.locationLabel;
    return `${Math.round((state.progress ?? 0) * 100)}%`;
  }

  return (
    <main className="site-shell" id="main">
      <div className="page-topline">
        <h1 className="site-title">The Library</h1>
      </div>

      <section className="toolbar" aria-label="Library controls">
        <div className="toolbar-search search-wrap">
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
          </div>
          <div className="cover-grid continue-grid">
            {recentBooks.map((book) => (
              <Link key={book.slug} className="cover-link" href={`/read/${book.slug}`} aria-label={`Resume ${book.title}`} prefetch={false}>
                <span className="resume-badge">Resume</span>
                <BookCover book={book} />
                <span className="resume-detail">{resumeDetailFor(book)}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-live="polite" aria-busy={false}>
        {view === "list" ? (
          <div className="section-heading">
            <h2>List</h2>
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
          </div>
        ) : null}

        {filteredBooks.length === 0 ? (
          <div className="empty-state">No books match the current search and filters.</div>
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
              <article key={book.slug} className="list-book-item">
                <Link className="list-book-cover" href={`/books/${book.slug}`} aria-label={`Open details for ${book.title}`} prefetch={false}>
                  <BookCover book={book} />
                </Link>
                <div className="list-book-main">
                  <Link className="list-book-title" href={`/books/${book.slug}`} title={book.title} prefetch={false}>
                    {book.title}
                  </Link>
                  <AuthorLinks author={book.author} authors={book.authors} className="list-book-authors" prefix="By " />
                  <span className="list-book-category">{categoryLabel(book.category)}</span>
                </div>
                <div className="list-book-meta">
                  <span className="list-format">{book.format}</span>
                  <span>{book.pageCount.toLocaleString()} pages</span>
                  <span>{formatDate(book.publicationDate)}</span>
                </div>
              </article>
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
