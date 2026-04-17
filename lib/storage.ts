import "server-only";

import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const STORAGE_ROOT = path.resolve(process.cwd(), "storage");
export const BOOKS_DIR = path.join(STORAGE_ROOT, "books");
export const COVERS_DIR = path.join(STORAGE_ROOT, "covers");

export async function ensureStorageDirs() {
  await Promise.all([
    mkdir(BOOKS_DIR, { recursive: true }),
    mkdir(COVERS_DIR, { recursive: true }),
  ]);
}

export function normalizeStoragePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function resolveStoragePath(relativePath: string) {
  const normalized = normalizeStoragePath(relativePath);
  const resolved = path.resolve(STORAGE_ROOT, normalized);
  const rootWithSeparator = `${STORAGE_ROOT}${path.sep}`;

  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootWithSeparator)) {
    throw new Error("Invalid storage path.");
  }

  return resolved;
}

export async function writeStorageFile(relativePath: string, data: ArrayBuffer | Buffer) {
  await ensureStorageDirs();
  const target = resolveStoragePath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data)));
}

export async function getStorageFileInfo(relativePath: string) {
  const file = resolveStoragePath(relativePath);
  return stat(file);
}

export async function storageFileExists(relativePath: string) {
  try {
    await getStorageFileInfo(relativePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteStorageFile(relativePath: string) {
  try {
    await unlink(resolveStoragePath(relativePath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export function contentTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".epub":
      return "application/epub+zip";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

export function sanitizeFileStem(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}
