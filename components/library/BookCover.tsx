"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { displayBookTitle } from "@/lib/bookDisplay";
import type { BookCoverDTO } from "@/lib/types";

const publicR2BaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") || "";
const loggedSources = new Set<string>();

type BookCoverProps = {
  book: BookCoverDTO;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

function encodeObjectKey(pathname: string) {
  return pathname
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function coverSrcFor(book: BookCoverProps["book"]) {
  if (publicR2BaseUrl && book.coverBlobPath) {
    return {
      src: `${publicR2BaseUrl}/${encodeObjectKey(book.coverBlobPath)}`,
      source: "direct-public-r2" as const,
    };
  }

  const coverVersion = book.coverBlobPath || book.updatedAt || "";
  const apiSrc = `/api/books/${book.slug}/cover`;
  return {
    src: coverVersion ? `${apiSrc}?v=${encodeURIComponent(coverVersion)}` : apiSrc,
    source: "api-r2-proxy" as const,
  };
}

export function BookCover({ book, className, priority = false, sizes = "(max-width: 560px) 108px, (max-width: 860px) 33vw, 214px" }: BookCoverProps) {
  const { src: coverSrc, source } = coverSrcFor(book);
  const bookTitle = displayBookTitle(book.title);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === coverSrc;
  const coverClassName = ["book-cover-image", className].filter(Boolean).join(" ");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const logKey = `${source}:${book.slug}`;
    if (loggedSources.has(logKey)) return;
    loggedSources.add(logKey);
    console.info("[book-cover] source", { slug: book.slug, source });
  }, [book.slug, source]);

  if (failed) {
    return (
      <div className={["book-cover-fallback", "cover-fallback", className].filter(Boolean).join(" ")}>
        <span>{book.format}</span>
      </div>
    );
  }

  return (
    <Image
      src={coverSrc}
      alt={`Cover of ${bookTitle}`}
      fill
      sizes={sizes}
      priority={priority}
      className={coverClassName}
      onError={() => setFailedSrc(coverSrc)}
    />
  );
}
