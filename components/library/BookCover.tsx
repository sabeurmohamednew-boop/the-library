"use client";

import Image from "next/image";
import { useState } from "react";
import type { BookCoverDTO } from "@/lib/types";

type BookCoverProps = {
  book: BookCoverDTO;
  className?: string;
};

function coverApiSrc(book: BookCoverProps["book"]) {
  const coverVersion = book.coverBlobPath || book.updatedAt || "";
  const apiSrc = `/api/books/${book.slug}/cover`;
  return coverVersion ? `${apiSrc}?v=${encodeURIComponent(coverVersion)}` : apiSrc;
}

export function BookCover({ book, className }: BookCoverProps) {
  const coverSrc = coverApiSrc(book);
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
