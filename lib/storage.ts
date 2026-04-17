import "server-only";

import path from "node:path";
import { del } from "@vercel/blob";
import type { BlobDescriptor } from "@/lib/types";

const BOOK_CONTENT_TYPES = {
  PDF: "application/pdf",
  EPUB: "application/epub+zip",
} as const;

const COVER_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function blobStoreConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function sanitizeFileStem(value: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return sanitized || "file";
}

export function contentTypeForFormat(format: "PDF" | "EPUB") {
  return BOOK_CONTENT_TYPES[format];
}

export function extensionForContentType(contentType: string) {
  switch (contentType.toLowerCase()) {
    case "application/pdf":
      return ".pdf";
    case "application/epub+zip":
      return ".epub";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/avif":
      return ".avif";
    default:
      return "";
  }
}

export function blobPath(kind: "books" | "covers", fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const stem = sanitizeFileStem(fileName.replace(/\.[^.]+$/, ""));
  return `${kind}/${stem}-${Date.now()}${extension}`;
}

export function validateBookBlob(blob: BlobDescriptor, format: "PDF" | "EPUB") {
  const expectedType = contentTypeForFormat(format);
  const expectedExtension = format === "PDF" ? ".pdf" : ".epub";
  const pathname = blob.pathname.toLowerCase();
  const contentType = blob.contentType.toLowerCase();

  if (!pathname.endsWith(expectedExtension)) {
    return `The uploaded book file must be a ${format}.`;
  }

  if (contentType && contentType !== expectedType && contentType !== "application/octet-stream") {
    return `The uploaded file type does not match ${format}.`;
  }

  if (blob.size <= 0) {
    return "The uploaded book file is empty.";
  }

  return null;
}

export function validateCoverBlob(blob: BlobDescriptor) {
  const contentType = blob.contentType.toLowerCase();
  const extension = path.extname(blob.pathname).toLowerCase();

  if (!COVER_CONTENT_TYPES.has(contentType) || ![".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension)) {
    return "Cover image must be JPG, PNG, WEBP, or AVIF.";
  }

  if (blob.size <= 0) {
    return "The uploaded cover image is empty.";
  }

  return null;
}

export async function deleteBlobIfPresent(value: string | null | undefined) {
  if (!value) return;

  if (!blobStoreConfigured()) {
    console.warn("[blob] delete skipped because BLOB_READ_WRITE_TOKEN is not configured.");
    return;
  }

  try {
    await del(value);
  } catch (error) {
    console.warn("[blob] delete failed", error);
  }
}

export function bookFileAvailable(book: { bookBlobUrl?: string | null }) {
  return Boolean(book.bookBlobUrl);
}
