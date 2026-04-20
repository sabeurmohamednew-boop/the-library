import type { BookDTO } from "@/lib/types";

export const SITE_URL = "https://the-library-alpha.vercel.app";
export const SITE_NAME = "The Library";
export const SITE_TITLE = "The Library – Read, Track and Manage EPUB & PDF Books";
export const SITE_DESCRIPTION =
  "Read EPUB and PDF books, track progress, save notes and highlights, and manage your personal library in a fast, minimalist reading app built for focus.";
export const SITE_CATEGORY = "Books";
export const SITEMAP_FALLBACK_DATE = new Date("2026-01-01T00:00:00.000Z");

export function sitePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function absoluteUrl(path: string) {
  return new URL(sitePath(path), SITE_URL).toString();
}

export function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function cleanDescription(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateDescription(value: string, maxLength = 160) {
  const clean = cleanDescription(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

export function bookAuthorLabel(book: Pick<BookDTO, "author" | "authors">) {
  return book.authors.length > 0 ? book.authors.join(", ") : book.author;
}

export function bookPageTitle(book: Pick<BookDTO, "title" | "author" | "authors">) {
  const author = bookAuthorLabel(book);
  return author ? `${book.title} by ${author}` : book.title;
}

export function bookDescription(book: Pick<BookDTO, "title" | "description" | "author" | "authors" | "format">) {
  const description = cleanDescription(book.description);
  if (description) return truncateDescription(description);

  const author = bookAuthorLabel(book);
  return `Read details for ${book.title}${author ? ` by ${author}` : ""}, available as ${book.format}, in The Library.`;
}

export function authorDescription(author: string) {
  return `Browse books by ${author} in The Library.`;
}

export function bookCoverImage(book: Pick<BookDTO, "coverBlobUrl">) {
  try {
    const url = new URL(book.coverBlobUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
