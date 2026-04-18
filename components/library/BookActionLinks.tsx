"use client";

import Link from "next/link";
import { trackDownloadClick, trackReadClick } from "@/lib/analytics";
import type { BookDTO } from "@/lib/types";

type BookActionLinksProps = {
  book: Pick<BookDTO, "slug" | "title" | "format">;
  readClassName?: string;
  downloadClassName?: string;
};

export function BookActionLinks({
  book,
  readClassName = "button primary",
  downloadClassName = "button secondary",
}: BookActionLinksProps) {
  return (
    <>
      <Link className={readClassName} href={`/read/${book.slug}`} prefetch={false} onClick={() => trackReadClick(book)}>
        Read
      </Link>
      <a className={downloadClassName} href={`/api/books/${book.slug}/file?download=1`} onClick={() => trackDownloadClick(book)}>
        Download
      </a>
    </>
  );
}
