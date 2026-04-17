"use client";

import { useState } from "react";
import type { BookDTO } from "@/lib/types";

type BookCoverProps = {
  book: Pick<BookDTO, "slug" | "title" | "format">;
  className?: string;
};

export function BookCover({ book, className }: BookCoverProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={className ? `cover-frame cover-fallback ${className}` : "cover-frame cover-fallback"}>
        <span>{book.format}</span>
      </div>
    );
  }

  return (
    <img
      src={`/api/books/${book.slug}/cover`}
      alt={`Cover of ${book.title}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
