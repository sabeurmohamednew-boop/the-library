import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCard } from "@/components/library/BookCard";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { matchingAuthorForSlug } from "@/lib/authors";
import { safeGetBooksByAuthorSlug } from "@/lib/books";

export const dynamic = "force-dynamic";

type AuthorPageProps = {
  params: Promise<{ slug: string }>;
};

function decodeSlug(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await safeGetBooksByAuthorSlug(decodeSlug(slug));
  const books = result.ok ? result.data : [];
  const author = books.map((book) => matchingAuthorForSlug(book, decodeSlug(slug))).find(Boolean);

  if (!author) {
    return { title: "Author not found" };
  }

  return {
    title: `${author} books`,
    description: `Books by ${author} in The Library.`,
  };
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = await params;
  const result = await safeGetBooksByAuthorSlug(decodeSlug(slug));

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="Author books could not load." />;
  }

  const books = result.data;
  if (books.length === 0) notFound();

  const author = books.map((book) => matchingAuthorForSlug(book, decodeSlug(slug))).find(Boolean) ?? books[0].authors[0] ?? books[0].author;

  return (
    <main className="site-shell author-page" id="main">
      <div className="page-topline">
        <Link className="button subtle" href="/">
          Back to The Library
        </Link>
      </div>

      <section aria-labelledby="author-heading">
        <div className="section-heading author-page-heading">
          <div>
            <p className="muted small">Author</p>
            <h1 id="author-heading">{author}</h1>
          </div>
          <span className="muted small">
            {books.length} {books.length === 1 ? "book" : "books"}
          </span>
        </div>

        <div className="gallery-grid">
          {books.map((book) => (
            <BookCard key={book.slug} book={book} />
          ))}
        </div>

        {books.length === 1 ? (
          <div className="empty-state empty-state-quiet author-sparse-note">
            <h3>A small shelf for now.</h3>
            <p>Additional books by {author} will collect here automatically when they are added to the library.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
