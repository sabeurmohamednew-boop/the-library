import Link from "next/link";
import { categoryLabel, TRUNCATION_LIMITS } from "@/lib/config";
import { authorPath } from "@/lib/authors";
import { formatDate, truncateText } from "@/lib/text";
import type { BookDTO } from "@/lib/types";
import { BookCover } from "@/components/library/BookCover";

type BookCardProps = {
  book: BookDTO;
  started?: boolean;
};

export function BookCard({ book, started }: BookCardProps) {
  const title = truncateText(book.title, TRUNCATION_LIMITS.title);
  const description = truncateText(book.description, TRUNCATION_LIMITS.description);
  const author = truncateText(book.author, TRUNCATION_LIMITS.author);

  return (
    <article className="book-card">
      <Link className="cover-link" href={`/books/${book.slug}`} aria-label={`Open details for ${book.title}`}>
        <span className="format-badge">{book.format}</span>
        {started ? <span className="resume-badge">Resume</span> : null}
        <BookCover book={book} />
      </Link>

      <div className="book-card-body">
        <Link className="book-title-link" href={`/books/${book.slug}`} title={book.title}>
          {title.text}
        </Link>
        <p className="book-description">
          {description.text}{" "}
          {description.truncated ? (
            <Link href={`/books/${book.slug}`} aria-label={`Read more about ${book.title}`}>
              More
            </Link>
          ) : null}
        </p>
        <Link className="book-author author-link" href={authorPath(book.author)} title={book.author} aria-label={`View books by ${book.author}`}>
          By {author.text}
        </Link>
        <div className="book-meta">
          <span>
            {book.pageCount.toLocaleString()} pages / {formatDate(book.publicationDate)}
          </span>
          <span>{categoryLabel(book.category)}</span>
        </div>
        <div className="card-actions">
          <Link className="button primary" href={`/read/${book.slug}`}>
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
