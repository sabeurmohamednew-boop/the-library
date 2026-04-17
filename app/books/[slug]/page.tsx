import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCard } from "@/components/library/BookCard";
import { BookBookmarkButton } from "@/components/library/BookBookmarkButton";
import { BookCover } from "@/components/library/BookCover";
import { ShareButton } from "@/components/ShareButton";
import { categoryLabel } from "@/lib/config";
import { authorPath } from "@/lib/authors";
import { getBookBySlug, getRelatedBooks } from "@/lib/books";
import { storageFileExists } from "@/lib/storage";
import { formatDate, formatFileSize } from "@/lib/text";

export const dynamic = "force-dynamic";

type BookPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookBySlug(decodeURIComponent(slug));

  if (!book) {
    return { title: "Book not found" };
  }

  return {
    title: book.title,
    description: book.description,
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const book = await getBookBySlug(decodeURIComponent(slug));

  if (!book) notFound();

  const [relatedBooks, fileAvailable] = await Promise.all([
    getRelatedBooks(book.slug),
    storageFileExists(book.filePath),
  ]);

  return (
    <main className="site-shell" id="main">
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
            <p className="muted">
              By{" "}
              <Link className="author-link inline-author-link" href={authorPath(book.author)}>
                {book.author}
              </Link>
            </p>
          </div>

          <p className="details-description">{book.description}</p>

          {!fileAvailable ? (
            <div className="error-state">The stored book file is currently unavailable. The metadata remains visible.</div>
          ) : null}

          <div className="action-row">
            <Link className="button primary" href={`/read/${book.slug}`}>
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
      ) : null}
    </main>
  );
}
