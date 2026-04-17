import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookCard } from "@/components/library/BookCard";
import { getBooksByAuthorSlug } from "@/lib/books";

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
  const books = await getBooksByAuthorSlug(decodeSlug(slug));
  const author = books[0]?.author;

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
  const books = await getBooksByAuthorSlug(decodeSlug(slug));

  if (books.length === 0) notFound();

  const author = books[0].author;

  return (
    <main className="site-shell" id="main">
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
      </section>
    </main>
  );
}
