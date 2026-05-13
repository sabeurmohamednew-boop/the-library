import Link from "next/link";
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
      <Link className={readClassName} href={`/read/${book.slug}`} prefetch={false}>
        Read
      </Link>
      <a className={downloadClassName} href={`/api/books/${book.slug}/file?download=1`}>
        Download
      </a>
    </>
  );
}
