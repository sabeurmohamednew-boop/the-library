"use client";

import Image from "next/image";
import { useState } from "react";
import type { BookDTO } from "@/lib/types";

type BookCoverProps = {
  book: Pick<BookDTO, "slug" | "title" | "format"> & Partial<Pick<BookDTO, "coverBlobPath" | "coverBlobUrl" | "updatedAt">>;
  className?: string;
};

export function BookCover({ book, className }: BookCoverProps) {
  const coverVersion = book.coverBlobPath || book.coverBlobUrl || book.updatedAt || "";
  const coverSrc = coverVersion ? `/api/books/${book.slug}/cover?v=${encodeURIComponent(coverVersion)}` : `/api/books/${book.slug}/cover`;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === coverSrc;
  const coverClassName = ["book-cover-image", className].filter(Boolean).join(" ");

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
      alt={`Cover of ${book.title}`}
      fill
      sizes="(max-width: 560px) 108px, (max-width: 860px) 33vw, 214px"
      className={coverClassName}
      onError={() => setFailedSrc(coverSrc)}
    />
  );
}
