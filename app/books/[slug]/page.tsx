import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCard } from "@/components/library/BookCard";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookBookmarkButton } from "@/components/library/BookBookmarkButton";
import { BookCover } from "@/components/library/BookCover";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { ShareButton } from "@/components/ShareButton";
import { categoryLabel } from "@/lib/config";
import { safeGetBookBySlug, safeGetRelatedBooks } from "@/lib/books";
import { bookFileAvailable } from "@/lib/storage";
import { formatDate, formatFileSize } from "@/lib/text";

export const dynamic = "force-dynamic";

type BookPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await safeGetBookBySlug(decodeURIComponent(slug));

  if (!result.ok) {
    return { title: "The Library is unavailable" };
  }

  if (!result.data) {
    return { title: "Book not found" };
  }

  return {
    title: result.data.title,
    description: result.data.description,
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const bookResult = await safeGetBookBySlug(decodeURIComponent(slug));

  if (!bookResult.ok) {
    return <RuntimeNotice failure={bookResult.error} title="This book could not load." />;
  }

  const book = bookResult.data;
  if (!book) notFound();

  const relatedResult = await safeGetRelatedBooks(book.slug);
  const relatedBooks = relatedResult.ok ? relatedResult.data : [];
  const fileAvailable = bookFileAvailable(book);

  return (
    <main className="site-shell book-detail-page" id="main">
      <div className="page-topline">
        <Link className="button subtle" href="/">
          Back to The Library
        </Link>
      </div>

      <section className="details-grid" aria-labelledby="book-title">
        <div className="details-cover cover-frame">
          <BookCover book={book} />
        </div>

        <div className="details-content">
          <div>
            <p className="muted small">{book.format}</p>
            <h1 id="book-title">{book.title}</h1>
            <p className="muted detail-authors">
              <AuthorLinks author={book.author} authors={book.authors} linkClassName="inline-author-link" prefix="By " />
            </p>
          </div>

          <p className="details-description">{book.description}</p>

          {!fileAvailable ? (
            <div className="error-state">The stored book file is currently unavailable. The metadata remains visible.</div>
          ) : null}
          {!relatedResult.ok ? (
            <div className="error-state">Related books are temporarily unavailable.</div>
          ) : null}

          <div className="action-row">
            <Link className="button primary" href={`/read/${book.slug}`} prefetch={false}>
              Read
            </Link>
            <a className="button" href={`/api/books/${book.slug}/file?download=1`}>
              Download
            </a>
            <BookBookmarkButton slug={book.slug} />
            <ShareButton />
          </div>

          <dl className="metadata-grid">
            <div className="metadata-item">
              <dt>Format</dt>
              <dd>{book.format}</dd>
            </div>
            <div className="metadata-item">
              <dt>Pages</dt>
              <dd>{book.pageCount.toLocaleString()}</dd>
            </div>
            <div className="metadata-item">
              <dt>Publication date</dt>
              <dd>{formatDate(book.publicationDate)}</dd>
            </div>
            <div className="metadata-item">
              <dt>Upload date</dt>
              <dd>{formatDate(book.uploadDate)}</dd>
            </div>
            <div className="metadata-item">
              <dt>Category</dt>
              <dd>{categoryLabel(book.category)}</dd>
            </div>
            <div className="metadata-item">
              <dt>File size</dt>
              <dd>{formatFileSize(book.fileSize)}</dd>
            </div>
          </dl>
        </div>
      </section>

      {relatedBooks.length > 0 ? (
        <section aria-labelledby="related-heading">
          <div className="section-heading">
            <h2 id="related-heading">Related books</h2>
          </div>
          <div className="gallery-grid">
            {relatedBooks.map((related) => (
              <BookCard key={related.slug} book={related} />
            ))}
          </div>
        </section>
      ) : relatedResult.ok ? (
        <section className="related-empty-section" aria-labelledby="related-heading">
          <div className="section-heading">
            <h2 id="related-heading">Related books</h2>
          </div>
          <div className="empty-state empty-state-quiet">
            <h3>No related books yet.</h3>
            <p>More matches will appear here as the library grows around this category and author.</p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
