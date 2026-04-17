"use client";

import { upload } from "@vercel/blob/client";
import type { PutBlobResult } from "@vercel/blob";
import type { BlobDescriptor } from "@/lib/types";

type UploadKind = "book" | "cover";

function sanitizeFileStem(value: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return sanitized || "file";
}

function extensionFor(file: File) {
  const fromName = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (fromName) return fromName === ".jpeg" ? ".jpg" : fromName;

  const fromType: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/epub+zip": ".epub",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/avif": ".avif",
  };

  return fromType[file.type] ?? "";
}

function uploadPath(kind: UploadKind, file: File, slugHint: string) {
  const folder = kind === "book" ? "books" : "covers";
  const stem = sanitizeFileStem(slugHint || file.name.replace(/\.[^.]+$/, ""));
  return `${folder}/${stem}-${Date.now()}${extensionFor(file)}`;
}

function toDescriptor(blob: PutBlobResult, file: File): BlobDescriptor {
  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType || file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function uploadAdminBlob(file: File, kind: UploadKind, slugHint: string) {
  const blob = await upload(uploadPath(kind, file, slugHint), file, {
    access: "public",
    handleUploadUrl: "/api/admin/blob/upload",
    clientPayload: JSON.stringify({ kind }),
    contentType: file.type || undefined,
    multipart: file.size >= 100 * 1024 * 1024,
  });

  return toDescriptor(blob, file);
}
