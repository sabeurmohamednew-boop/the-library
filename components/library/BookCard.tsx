import Link from "next/link";
import { categoryLabel, TRUNCATION_LIMITS } from "@/lib/config";
import { formatDate, truncateText } from "@/lib/text";
import type { BookDTO } from "@/lib/types";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookCover } from "@/components/library/BookCover";

type BookCardProps = {
  book: BookDTO;
  started?: boolean;
};

export function BookCard({ book, started }: BookCardProps) {
  const title = truncateText(book.title, TRUNCATION_LIMITS.title);
  const description = truncateText(book.description, TRUNCATION_LIMITS.description);

  return (
    <article className="book-card">
      <Link className="cover-link" href={`/books/${book.slug}`} aria-label={`Open details for ${book.title}`} prefetch={false}>
        <span className="format-badge">{book.format}</span>
        {started ? <span className="resume-badge">Resume</span> : null}
        <BookCover book={book} />
      </Link>

      <div className="book-card-body">
        <Link className="book-title-link" href={`/books/${book.slug}`} title={book.title} prefetch={false}>
          {title.text}
        </Link>
        <p className="book-description">
          {description.text}{" "}
          {description.truncated ? (
            <Link href={`/books/${book.slug}`} aria-label={`Read more about ${book.title}`} prefetch={false}>
              More
            </Link>
          ) : null}
        </p>
        <AuthorLinks author={book.author} authors={book.authors} className="book-authors" prefix="By " />
        <div className="book-meta">
          <span>
            {book.pageCount.toLocaleString()} pages / {formatDate(book.publicationDate)}
          </span>
          <span>{categoryLabel(book.category)}</span>
        </div>
        <div className="card-actions">
          <Link className="button primary" href={`/read/${book.slug}`} prefetch={false}>
            Read
          </Link>
          <a className="button secondary" href={`/api/books/${book.slug}/file?download=1`}>
            Download
          </a>
        </div>
      </div>
    </article>
  );
}
