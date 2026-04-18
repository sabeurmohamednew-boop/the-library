import "server-only";

import path from "node:path";
import { normalizeAuthorsForStorage } from "@/lib/authors";
import { prisma } from "@/lib/db";
import { buildBookSearchText } from "@/lib/books";
import { runtimeFailure, logRuntimeFailure } from "@/lib/runtime";
import { slugify } from "@/lib/slug";
import { contentTypeForFormat, validateBookBlob } from "@/lib/storage";
import type { BlobDescriptor, BookDTO, BookFormat } from "@/lib/types";
import type { BookImportInput } from "@/lib/validation";

export function bookExtensionFor(format: BookFormat) {
  return format === "PDF" ? ".pdf" : ".epub";
}

export async function uniqueSlug(title: string, exceptId?: string) {
  const base = slugify(title);
  let candidate = base;
  let index = 2;

  while (
    await prisma.book.findFirst({
      where: {
        slug: candidate,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

export function bookDataFromInput(input: BookImportInput) {
  const author = normalizeAuthorsForStorage(input.author);

  return {
    title: input.title,
    description: input.description,
    author,
    format: input.format,
    category: input.category,
    pageCount: input.pageCount,
    publicationDate: input.publicationDate,
    searchText: buildBookSearchText({ ...input, author }),
  };
}

export function fileDataFromBlob(blob: BlobDescriptor, format: BookFormat) {
  return {
    bookBlobUrl: blob.url,
    bookBlobPath: blob.pathname,
    fileSize: blob.size,
    fileContentType: blob.contentType === "application/octet-stream" ? contentTypeForFormat(format) : blob.contentType,
  };
}

export function coverDataFromBlob(blob: BlobDescriptor) {
  return {
    coverBlobUrl: blob.url,
    coverBlobPath: blob.pathname,
    coverContentType: blob.contentType,
  };
}

export function validateReplacementFormat(currentPath: string, currentContentType: string, nextFormat: BookFormat, replacementBlob?: BlobDescriptor) {
  if (replacementBlob) {
    return validateBookBlob(replacementBlob, nextFormat);
  }

  const existingExtension = path.extname(currentPath).toLowerCase();
  const expectedExtension = bookExtensionFor(nextFormat);
  const existingContentType = currentContentType.toLowerCase();
  const contentTypeMatches = existingContentType === contentTypeForFormat(nextFormat) || (nextFormat === "EPUB" && existingContentType === "application/octet-stream");

  if (existingExtension !== expectedExtension || !contentTypeMatches) {
    return "Changing format requires replacing the book file with a matching file.";
  }

  return null;
}

export function safeAdminError(error: unknown, fallback = "The request could not be completed.") {
  const failure = runtimeFailure("admin.request", error);
  logRuntimeFailure(failure);
  return failure.userMessage === "The Library could not load this data. Please try again shortly." ? fallback : failure.userMessage;
}

export function adminBookUrl(book: Pick<BookDTO, "id">) {
  return `/admin/books/${book.id}/edit`;
}
