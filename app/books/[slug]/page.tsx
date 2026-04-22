import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookActionLinks } from "@/components/library/BookActionLinks";
import { BookCard } from "@/components/library/BookCard";
import { AuthorLinks } from "@/components/library/AuthorLinks";
import { BookBookmarkButton } from "@/components/library/BookBookmarkButton";
import { BookCover } from "@/components/library/BookCover";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { ShareButton } from "@/components/ShareButton";
import { displayBookDescription, displayBookTitle, displayCategoryLabel, displayPublicationDate } from "@/lib/bookDisplay";
import { safeGetBookBySlug, safeGetRelatedLibraryBooks } from "@/lib/books";
import { bookCoverImage, bookDescription, bookPageTitle, decodeRouteParam, SITE_NAME } from "@/lib/seo";
import { bookFileAvailable } from "@/lib/storage";
import { formatDate, formatFileSize } from "@/lib/text";

export const dynamic = "force-dynamic";

type BookPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await safeGetBookBySlug(decodeRouteParam(slug));

  if (!result.ok) {
    return {
      title: "The Library is unavailable",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  if (!result.data) {
    return {
      title: "Book not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const book = result.data;
  const title = bookPageTitle(book);
  const fullTitle = `${title} | ${SITE_NAME}`;
  const description = bookDescription(book);
  const canonical = `/books/${book.slug}`;
  const coverImage = bookCoverImage(book);
  const bookTitle = displayBookTitle(book.title);
  const openGraphImages = coverImage ? [{ url: coverImage, alt: `Cover of ${bookTitle}` }] : undefined;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: fullTitle,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: "article",
      ...(openGraphImages ? { images: openGraphImages } : {}),
    },
    twitter: {
      card: coverImage ? "summary_large_image" : "summary",
      title: fullTitle,
      description,
      ...(coverImage ? { images: [coverImage] } : {}),
    },
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const { slug } = await params;
  const bookResult = await safeGetBookBySlug(decodeRouteParam(slug));

  if (!bookResult.ok) {
    return <RuntimeNotice failure={bookResult.error} title="This book could not load." />;
  }

  const book = bookResult.data;
  if (!book) notFound();

  const relatedResult = await safeGetRelatedLibraryBooks(book.slug);
  const relatedBooks = relatedResult.ok ? relatedResult.data : [];
  const fileAvailable = bookFileAvailable(book);
  const bookTitle = displayBookTitle(book.title);
  const description = displayBookDescription(book.description);

  return (
    <main className="site-shell book-detail-page" id="main">
      <div className="page-topline">
        <Link className="button subtle" href="/">
          Back to The Library
        </Link>
      </div>

      <section className="details-grid" aria-labelledby="book-title">
        <div className="details-cover cover-frame">
          <BookCover book={{ slug: book.slug, title: bookTitle, format: book.format, coverBlobPath: book.coverBlobPath, updatedAt: book.updatedAt }} />
        </div>

        <div className="details-content">
          <div>
            <p className="muted small">{book.format}</p>
            <h1 id="book-title">{bookTitle}</h1>
            <p className="muted detail-authors">
              <AuthorLinks author={book.author} authors={book.authors} linkClassName="inline-author-link" prefix="By " />
            </p>
          </div>

          <p className="details-description">{description}</p>

          {!fileAvailable ? (
            <div className="error-state">The stored book file is currently unavailable. The metadata remains visible.</div>
          ) : null}
          {!relatedResult.ok ? (
            <div className="error-state">Related books are temporarily unavailable.</div>
          ) : null}

          <div className="action-row">
            <BookActionLinks book={{ slug: book.slug, title: bookTitle, format: book.format }} downloadClassName="button" />
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
              <dd>{displayPublicationDate(book.publicationDate, book.publicationDatePrecision)}</dd>
            </div>
            <div className="metadata-item">
              <dt>Upload date</dt>
              <dd>{formatDate(book.uploadDate)}</dd>
            </div>
            <div className="metadata-item">
              <dt>Category</dt>
              <dd>{displayCategoryLabel(book.category)}</dd>
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
