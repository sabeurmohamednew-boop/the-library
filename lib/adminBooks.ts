import "server-only";

import path from "node:path";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { buildBookSearchText } from "@/lib/books";
import { slugify } from "@/lib/slug";
import {
  deleteStorageFile,
  normalizeStoragePath,
  sanitizeFileStem,
  writeStorageFile,
} from "@/lib/storage";
import type { BookDTO, BookFormat } from "@/lib/types";
import type { BookImportInput } from "@/lib/validation";

export function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function formFile(formData: FormData, name: string) {
  const value = formData.get(name);
  if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function" || value.size <= 0) {
    return null;
  }
  return value;
}

export function bookExtensionFor(format: BookFormat) {
  return format === "PDF" ? ".pdf" : ".epub";
}

export function coverExtension(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  const fromType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
  };

  const resolved = extension || fromType[file.type] || "";
  return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(resolved) ? resolved : "";
}

export function validateBookFile(file: File, format: BookFormat) {
  const expectedExtension = bookExtensionFor(format);
  const extension = path.extname(file.name).toLowerCase();
  const expectedMime = format === "PDF" ? "application/pdf" : "application/epub+zip";

  if (extension !== expectedExtension) {
    return `The selected book file must be a ${format}.`;
  }

  if (file.type && file.type !== expectedMime && !(format === "EPUB" && file.type === "application/octet-stream")) {
    return `The selected file type does not match ${format}.`;
  }

  return null;
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

export function uploadPath(kind: "books" | "covers", slug: string, extension: string, version = Date.now()) {
  const cleanExtension = extension === ".jpeg" ? ".jpg" : extension;
  return normalizeStoragePath(`${kind}/${slug}-${version}${cleanExtension}`);
}

export async function saveUploadedFile(relativePath: string, file: File) {
  await writeStorageFile(relativePath, await file.arrayBuffer());
}

export async function cleanupUnreferencedFile(relativePath: string | null | undefined) {
  if (!relativePath) return;

  const references = await prisma.book.count({
    where: {
      OR: [{ filePath: relativePath }, { coverImagePath: relativePath }],
    },
  });

  if (references === 0) {
    await deleteStorageFile(relativePath);
  }
}

export function bookDataFromInput(input: BookImportInput) {
  return {
    title: input.title,
    description: input.description,
    author: input.author,
    format: input.format,
    category: input.category,
    pageCount: input.pageCount,
    publicationDate: input.publicationDate,
    searchText: buildBookSearchText(input),
  };
}

export function validateReplacementFormat(currentFilePath: string, nextFormat: BookFormat, replacementFile: File | null) {
  if (replacementFile) {
    return validateBookFile(replacementFile, nextFormat);
  }

  const existingExtension = path.extname(currentFilePath).toLowerCase();
  if (existingExtension !== bookExtensionFor(nextFormat)) {
    return "Changing format requires replacing the book file with a matching file.";
  }

  return null;
}

export function safeAdminError(error: unknown, fallback = "The request could not be completed.") {
  if (process.env.NODE_ENV !== "production") {
    console.error(error);
  }
  return fallback;
}

export function inferPdfPageCount(buffer: Buffer) {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? null;
}

export async function inferEpubMetadata(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const container = await zip.file("META-INF/container.xml")?.async("text");
  const opfPath = container?.match(/full-path=["']([^"']+)["']/)?.[1];
  const opf = opfPath ? await zip.file(opfPath)?.async("text") : undefined;

  if (!opf) return null;

  const title = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i)?.[1]?.trim();
  const author = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i)?.[1]?.trim();
  const spineCount = (opf.match(/<itemref\b/gi) ?? []).length;

  return {
    title,
    author,
    pageCount: spineCount ? Math.max(1, spineCount * 20) : null,
  };
}

export function adminBookUrl(book: Pick<BookDTO, "id">) {
  return `/admin/books/${book.id}/edit`;
}
