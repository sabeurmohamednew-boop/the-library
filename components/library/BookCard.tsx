import Link from "next/link";
import { TRUNCATION_LIMITS } from "@/lib/libraryConfig";
import { displayBookDescription, displayBookTitle, displayCategoryLabel, displayPublicationDate } from "@/lib/bookDisplay";
import { truncateText } from "@/lib/text";
import type { LibraryBookDTO } from "@/lib/types";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookActionLinks } from "@/components/library/BookActionLinks";
import { BookCover } from "@/components/library/BookCover";

type BookCardProps = {
  book: LibraryBookDTO;
  started?: boolean;
  imagePriority?: boolean;
};

export function BookCard({ book, imagePriority = false }: BookCardProps) {
  const bookTitle = displayBookTitle(book.title);
  const title = truncateText(bookTitle, TRUNCATION_LIMITS.title);
  const description = truncateText(displayBookDescription(book.description), TRUNCATION_LIMITS.description);

  return (
    <article className="book-card">
      <Link className="cover-link" href={`/books/${book.slug}`} aria-label={`Open details for ${bookTitle}`} prefetch={false}>
        <span className="format-badge">{book.format}</span>
        <BookCover
          book={{ slug: book.slug, title: bookTitle, format: book.format, coverBlobPath: book.coverBlobPath, updatedAt: book.updatedAt }}
          priority={imagePriority}
          sizes="(max-width: 560px) 108px, (max-width: 860px) 108px, (max-width: 1200px) 22vw, 214px"
        />
      </Link>

      <div className="book-card-body">
        <Link className="book-title-link" href={`/books/${book.slug}`} title={bookTitle} prefetch={false}>
          {title.text}
        </Link>
        <p className="book-description">
          {description.text}{" "}
          {description.truncated ? (
            <Link href={`/books/${book.slug}`} aria-label={`Read more about ${bookTitle}`} prefetch={false}>
              More
            </Link>
          ) : null}
        </p>
        <AuthorLinks author={book.author} authors={book.authors} className="book-authors" prefix="By " />
        <div className="book-meta">
          <span>
            {book.pageCount.toLocaleString()} pages / {displayPublicationDate(book.publicationDate, book.publicationDatePrecision)}
          </span>
          <span>{displayCategoryLabel(book.category)}</span>
        </div>
        <div className="card-actions">
          <BookActionLinks book={{ slug: book.slug, title: bookTitle, format: book.format }} />
        </div>
      </div>
    </article>
  );
}
