import "server-only";

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { extensionForContentType } from "@/lib/storage";

type LocalFileKind = "books" | "covers";

export type LocalFile = {
  path: string;
  size: number;
  mtime: Date;
};

type LocalBookInput = {
  slug: string;
  format: "PDF" | "EPUB";
  bookBlobPath?: string | null;
};

type LocalCoverInput = {
  slug: string;
  coverBlobPath?: string | null;
  coverContentType?: string | null;
};

const LOCAL_STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT
  ? path.resolve(process.env.LOCAL_STORAGE_ROOT)
  : path.join(process.cwd(), "storage");

const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

function localStorageDir(kind: LocalFileKind) {
  return path.join(LOCAL_STORAGE_ROOT, kind);
}

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return null;
  return parts.join(path.sep);
}

async function findLocalFile(kind: LocalFileKind, candidates: string[]): Promise<LocalFile | null> {
  const baseDir = localStorageDir(kind);

  for (const candidate of candidates) {
    const relative = safeRelativePath(candidate);
    if (!relative) continue;

    const filePath = path.join(baseDir, relative.startsWith(`${kind}${path.sep}`) ? relative.slice(kind.length + 1) : relative);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(`${baseDir}${path.sep}`)) continue;

    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile() && stat.size > 0) {
        return { path: resolved, size: stat.size, mtime: stat.mtime };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[local-files] stat failed", { kind, candidate, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return null;
}

export async function findLocalBookFile(book: LocalBookInput) {
  const extension = book.format === "PDF" ? ".pdf" : ".epub";
  return findLocalFile("books", [book.bookBlobPath ?? "", `${book.slug}${extension}`].filter(Boolean));
}

export async function findLocalCoverFile(book: LocalCoverInput) {
  const contentTypeExtension = book.coverContentType ? extensionForContentType(book.coverContentType) : "";
  const slugCandidates = [...new Set([contentTypeExtension, ...COVER_EXTENSIONS].filter(Boolean))].map((extension) => `${book.slug}${extension}`);
  return findLocalFile("covers", [book.coverBlobPath ?? "", ...slugCandidates].filter(Boolean));
}

export function localNodeFileReadableStream(filePath: string, options?: { start?: number; end?: number }) {
  const stream = createReadStream(filePath, options);
  return Readable.toWeb(stream) as unknown as BodyInit;
}
