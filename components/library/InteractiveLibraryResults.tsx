"use client";

import Link from "next/link";
import { useMemo } from "react";
import { LIBRARY_PAGE_SIZE } from "@/lib/libraryConfig";
import { authorPath, buildAuthorRows } from "@/lib/authors";
import { displayAuthorName, displayBookTitle } from "@/lib/bookDisplay";
import { normalizeSearch } from "@/lib/text";
import type { ReaderState } from "@/lib/types";
import { BookCard } from "@/components/library/BookCard";
import { BookCover } from "@/components/library/BookCover";
import type { IndexedLibraryBook, ListMode, SortMode, ViewMode } from "@/components/library/libraryViewTypes";

type InteractiveLibraryResultsProps = {
  books: IndexedLibraryBook[];
  view: ViewMode;
  listMode: ListMode;
  sort: SortMode;
  format: string;
  category: string;
  bookmarkedOnly: boolean;
  search: string;
  visibleCount: number;
  readerStates: Map<string, ReaderState>;
  bookmarkedSlugs: Set<string>;
  onReset: () => void;
};

export function filterAndSortBooks({
  books,
  sort,
  format,
  category,
  bookmarkedOnly,
  search,
  bookmarkedSlugs,
}: Pick<InteractiveLibraryResultsProps, "books" | "sort" | "format" | "category" | "bookmarkedOnly" | "search" | "bookmarkedSlugs">) {
  const query = normalizeSearch(search);

  return books
    .filter((book) => {
      if (format && book.format !== format) return false;
      if (category && book.category !== category) return false;
      if (bookmarkedOnly && !bookmarkedSlugs.has(book.slug)) return false;
      if (!query) return true;
      return book.searchText.includes(query);
    })
    .sort((a, b) => {
      switch (sort) {
        case "title-desc":
          return b.title.localeCompare(a.title);
        case "publication-desc":
          return b.publicationTime - a.publicationTime;
        case "publication-asc":
          return a.publicationTime - b.publicationTime;
        case "upload-desc":
          return b.uploadTime - a.uploadTime;
        case "upload-asc":
          return a.uploadTime - b.uploadTime;
        case "title-asc":
        default:
          return a.title.localeCompare(b.title);
      }
    });
}

export function InteractiveLibraryResults({
  books,
  view,
  listMode,
  sort,
  format,
  category,
  bookmarkedOnly,
  search,
  visibleCount,
  readerStates,
  bookmarkedSlugs,
  onReset,
}: InteractiveLibraryResultsProps) {
  const filteredBooks = useMemo(
    () => filterAndSortBooks({ books, sort, format, category, bookmarkedOnly, search, bookmarkedSlugs }),
    [bookmarkedOnly, bookmarkedSlugs, books, category, format, search, sort],
  );
  const visibleBooks = filteredBooks.slice(0, visibleCount);
  const hasActiveFilters = Boolean(search.trim() || format || category || bookmarkedOnly);
  const noBookmarkedBooks = bookmarkedOnly && bookmarkedSlugs.size === 0;
  const authorRows = useMemo(() => buildAuthorRows(filteredBooks), [filteredBooks]);

  if (filteredBooks.length === 0) {
    return (
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
          <button className="button primary" type="button" onClick={onReset}>
            Reset search and filters
          </button>
        ) : null}
      </div>
    );
  }

  if (view === "gallery") {
    return (
      <div className="gallery-grid">
        {visibleBooks.map((book, index) => (
          <BookCard key={book.slug} book={book} started={(readerStates.get(book.slug)?.progress ?? 0) > 0} imagePriority={index < 2} />
        ))}
      </div>
    );
  }

  if (view === "cover") {
    return (
      <div className="cover-grid">
        {visibleBooks.map((book) => {
          const bookTitle = displayBookTitle(book.title);

          return (
            <Link key={book.slug} className="cover-link" href={`/books/${book.slug}`} aria-label={`Open details for ${bookTitle}`} prefetch={false}>
              <BookCover
                book={{ slug: book.slug, title: bookTitle, format: book.format, coverBlobPath: book.coverBlobPath, updatedAt: book.updatedAt }}
                sizes="(max-width: 560px) 30vw, (max-width: 860px) 18vw, 112px"
              />
            </Link>
          );
        })}
      </div>
    );
  }

  if (listMode === "titles") {
    return (
      <div className="library-list book-list">
        {visibleBooks.map((book) => {
          const bookTitle = displayBookTitle(book.title);

          return (
            <Link key={book.slug} className="title-list-item" href={`/books/${book.slug}`} title={bookTitle} prefetch={false}>
              <span className="title-list-title">{bookTitle}</span>
              <span className="title-list-meta" aria-label={`${book.format}, ${book.pageCount.toLocaleString()} pages`}>
                <span className="title-list-format">{book.format}</span>
                <span className="title-list-pages">{book.pageCount.toLocaleString()} pages</span>
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="library-list author-list">
      {authorRows.slice(0, LIBRARY_PAGE_SIZE.list).map(({ author, count }) => (
        <Link key={authorPath(author)} className="list-item author-list-item" href={authorPath(author)} aria-label={`View books by ${displayAuthorName(author)}`} prefetch={false}>
          <span>{displayAuthorName(author)}</span>
          <span className="muted small">
            {count} {count === 1 ? "book" : "books"}
          </span>
        </Link>
      ))}
    </div>
  );
}
