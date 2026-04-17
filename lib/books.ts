import "server-only";

import type { Book } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authorSlug } from "@/lib/authors";
import type { BookDTO } from "@/lib/types";

export function serializeBook(book: Book): BookDTO {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    description: book.description,
    author: book.author,
    format: book.format as BookDTO["format"],
    category: book.category as BookDTO["category"],
    pageCount: book.pageCount,
    publicationDate: book.publicationDate.toISOString(),
    uploadDate: book.uploadDate.toISOString(),
    coverImagePath: book.coverImagePath,
    filePath: book.filePath,
    fileSize: book.fileSize,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}

export async function getAllBooks() {
  const books = await prisma.book.findMany({
    orderBy: [{ uploadDate: "desc" }, { title: "asc" }],
  });

  return books.map(serializeBook);
}

export async function getBookBySlug(slug: string) {
  const book = await prisma.book.findUnique({
    where: { slug },
  });

  return book ? serializeBook(book) : null;
}

export async function getBookById(id: string) {
  const book = await prisma.book.findUnique({
    where: { id },
  });

  return book ? serializeBook(book) : null;
}

export async function getRelatedBooks(slug: string) {
  const book = await prisma.book.findUnique({ where: { slug } });
  if (!book) return [];

  const books = await prisma.book.findMany({
    where: {
      slug: { not: slug },
      OR: [{ author: book.author }, { category: book.category }],
    },
    orderBy: [{ author: "asc" }, { uploadDate: "desc" }],
    take: 6,
  });

  return books.map(serializeBook);
}

export async function getBooksByAuthorSlug(slug: string) {
  const books = await prisma.book.findMany({
    orderBy: [{ publicationDate: "desc" }, { title: "asc" }],
  });

  return books.filter((book) => authorSlug(book.author) === slug).map(serializeBook);
}

export function buildBookSearchText(input: Pick<BookDTO, "title" | "author" | "description">) {
  return `${input.title} ${input.author} ${input.description}`.toLowerCase();
}
