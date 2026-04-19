import "server-only";

import type { Book } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { authorSlug, bookAuthors, bookHasAuthorSlug, normalizeAuthorsForStorage } from "@/lib/authors";
import { safeRuntime } from "@/lib/runtime";
import type { BookDTO, LibraryBookDTO, ReaderBookDTO } from "@/lib/types";

type BookIdentity = Pick<Book, "id" | "slug" | "title" | "author">;

function bookIdentity(book: BookIdentity) {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: book.author,
  };
}

function logBookRead(scope: string, data: Record<string, unknown>) {
  console.info("[book-read]", scope, data);
}

export function serializeBook(book: Book): BookDTO {
  const author = normalizeAuthorsForStorage(book.author);

  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    description: book.description,
    author,
    authors: bookAuthors({ author }),
    format: book.format as BookDTO["format"],
    category: book.category as BookDTO["category"],
    pageCount: book.pageCount,
    publicationDate: book.publicationDate.toISOString(),
    uploadDate: book.uploadDate.toISOString(),
    bookBlobUrl: book.bookBlobUrl,
    bookBlobPath: book.bookBlobPath,
    coverBlobUrl: book.coverBlobUrl,
    coverBlobPath: book.coverBlobPath,
    fileSize: book.fileSize,
    fileContentType: book.fileContentType,
    coverContentType: book.coverContentType,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}

type LibraryBookRecord = Pick<Book, "slug" | "title" | "description" | "author" | "format" | "category" | "pageCount" | "publicationDate" | "uploadDate" | "coverBlobPath" | "updatedAt">;
type ReaderBookRecord = Pick<Book, "id" | "slug" | "title" | "author" | "format" | "pageCount">;

export function serializeLibraryBook(book: LibraryBookRecord): LibraryBookDTO {
  const author = normalizeAuthorsForStorage(book.author);

  return {
    slug: book.slug,
    title: book.title,
    description: book.description,
    author,
    authors: bookAuthors({ author }),
    format: book.format as LibraryBookDTO["format"],
    category: book.category as LibraryBookDTO["category"],
    pageCount: book.pageCount,
    publicationDate: book.publicationDate.toISOString(),
    uploadDate: book.uploadDate.toISOString(),
    coverBlobPath: book.coverBlobPath,
    updatedAt: book.updatedAt.toISOString(),
  };
}

export function serializeReaderBook(book: ReaderBookRecord): ReaderBookDTO {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    author: normalizeAuthorsForStorage(book.author),
    format: book.format as ReaderBookDTO["format"],
    pageCount: book.pageCount,
  };
}

const libraryBookSelect = {
  slug: true,
  title: true,
  description: true,
  author: true,
  format: true,
  category: true,
  pageCount: true,
  publicationDate: true,
  uploadDate: true,
  coverBlobPath: true,
  updatedAt: true,
} as const;

const readerBookSelect = {
  id: true,
  slug: true,
  title: true,
  author: true,
  format: true,
  pageCount: true,
} as const;

export async function getAllBooks() {
  noStore();
  const books = await prisma.book.findMany({
    orderBy: [{ uploadDate: "desc" }, { title: "asc" }],
  });
  logBookRead("list", {
    count: books.length,
    books: books.map(bookIdentity),
  });

  return books.map(serializeBook);
}

export function safeGetAllBooks() {
  return safeRuntime("books.list", getAllBooks);
}

export async function getAllLibraryBooks() {
  noStore();
  const books = await prisma.book.findMany({
    select: libraryBookSelect,
    orderBy: [{ uploadDate: "desc" }, { title: "asc" }],
  });
  logBookRead("libraryList", {
    count: books.length,
    books: books.map((book) => ({
      slug: book.slug,
      title: book.title,
      author: book.author,
    })),
  });

  return books.map(serializeLibraryBook);
}

export function safeGetAllLibraryBooks() {
  return safeRuntime("books.libraryList", getAllLibraryBooks);
}

export async function getBookBySlug(slug: string) {
  noStore();
  const book = await prisma.book.findUnique({
    where: { slug },
  });
  logBookRead("bySlug", {
    requestedSlug: slug,
    book: book ? bookIdentity(book) : null,
  });

  return book ? serializeBook(book) : null;
}

export function safeGetBookBySlug(slug: string) {
  return safeRuntime("books.bySlug", () => getBookBySlug(slug), { slug });
}

export async function getReaderBookBySlug(slug: string) {
  noStore();
  const book = await prisma.book.findUnique({
    where: { slug },
    select: readerBookSelect,
  });
  logBookRead("readerBySlug", {
    requestedSlug: slug,
    book: book ? bookIdentity(book) : null,
  });

  return book ? serializeReaderBook(book) : null;
}

export function safeGetReaderBookBySlug(slug: string) {
  return safeRuntime("books.readerBySlug", () => getReaderBookBySlug(slug), { slug });
}

export async function getBookById(id: string) {
  noStore();
  const book = await prisma.book.findUnique({
    where: { id },
  });
  logBookRead("byId", {
    requestedId: id,
    book: book ? bookIdentity(book) : null,
  });

  return book ? serializeBook(book) : null;
}

export function safeGetBookById(id: string) {
  return safeRuntime("books.byId", () => getBookById(id), { id });
}

export async function getRelatedBooks(slug: string) {
  noStore();
  const book = await prisma.book.findUnique({ where: { slug } });
  if (!book) return [];

  const books = await prisma.book.findMany({
    where: {
      slug: { not: slug },
    },
    orderBy: [{ author: "asc" }, { uploadDate: "desc" }],
  });
  const source = serializeBook(book);
  const sourceAuthorSlugs = new Set(source.authors.map(authorSlug));
  const filtered = books
    .map(serializeBook)
    .filter((candidate) => candidate.category === source.category || candidate.authors.some((author) => sourceAuthorSlugs.has(authorSlug(author))))
    .slice(0, 6);
  logBookRead("related", {
    source: bookIdentity(book),
    books: filtered.map(bookIdentity),
  });

  return filtered;
}

export function safeGetRelatedBooks(slug: string) {
  return safeRuntime("books.related", () => getRelatedBooks(slug), { slug });
}

export async function getRelatedLibraryBooks(slug: string) {
  noStore();
  const book = await prisma.book.findUnique({ where: { slug } });
  if (!book) return [];

  const books = await prisma.book.findMany({
    where: {
      slug: { not: slug },
    },
    select: libraryBookSelect,
    orderBy: [{ author: "asc" }, { uploadDate: "desc" }],
  });
  const source = serializeBook(book);
  const sourceAuthorSlugs = new Set(source.authors.map(authorSlug));
  const filtered = books
    .map(serializeLibraryBook)
    .filter((candidate) => candidate.category === source.category || candidate.authors.some((author) => sourceAuthorSlugs.has(authorSlug(author))))
    .slice(0, 6);
  logBookRead("relatedLibrary", {
    source: bookIdentity(book),
    books: filtered.map((candidate) => ({
      slug: candidate.slug,
      title: candidate.title,
      author: candidate.author,
    })),
  });

  return filtered;
}

export function safeGetRelatedLibraryBooks(slug: string) {
  return safeRuntime("books.relatedLibrary", () => getRelatedLibraryBooks(slug), { slug });
}

export async function getBooksByAuthorSlug(slug: string) {
  noStore();
  const requestedSlug = authorSlug(slug);
  const books = await prisma.book.findMany({
    orderBy: [{ publicationDate: "desc" }, { title: "asc" }],
  });
  const filtered = books.filter((book) => bookHasAuthorSlug({ author: book.author }, requestedSlug));
  logBookRead("byAuthor", {
    requestedAuthorSlug: requestedSlug,
    books: filtered.map(bookIdentity),
  });

  return filtered.map(serializeBook);
}

export function safeGetBooksByAuthorSlug(slug: string) {
  return safeRuntime("books.byAuthor", () => getBooksByAuthorSlug(slug), { slug });
}

export function buildBookSearchText(input: Pick<BookDTO, "title" | "author" | "description">) {
  return `${input.title} ${normalizeAuthorsForStorage(input.author)} ${input.description}`.toLowerCase();
}
