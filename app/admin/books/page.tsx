import type { Metadata } from "next";
import Link from "next/link";
import { AdminDeleteButton } from "@/components/admin/AdminDeleteButton";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminNav } from "@/components/admin/AdminNav";
import { BookCover } from "@/components/library/BookCover";
import { BOOK_CATEGORIES, BOOK_FORMATS, categoryLabel } from "@/lib/config";
import { adminPasswordConfigured, isAdminSession } from "@/lib/adminAuth";
import { serializeBook } from "@/lib/books";
import { prisma } from "@/lib/db";
import { safeRuntime } from "@/lib/runtime";
import { formatDate } from "@/lib/text";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage books",
  robots: {
    index: false,
    follow: false,
  },
};

type AdminBooksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminBooksPage({ searchParams }: AdminBooksPageProps) {
  const configured = adminPasswordConfigured();
  const authenticated = configured ? await isAdminSession() : false;
  const params = await searchParams;
  const query = single(params.q)?.trim() ?? "";
  const format = single(params.format) ?? "";
  const category = single(params.category) ?? "";

  if (!configured) {
    return (
      <main className="admin-shell" id="main">
        <div className="error-state">Set ADMIN_PASSWORD in the environment before using the admin area.</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-shell" id="main">
        <div className="page-topline">
          <h1 className="site-title">Manage books</h1>
          <Link className="button" href="/">
            The Library
          </Link>
        </div>
        <AdminLogin />
      </main>
    );
  }

  const booksResult = await safeRuntime("admin.books", async () =>
    (
      await prisma.book.findMany({
        where: {
          ...(format ? { format } : {}),
          ...(category ? { category } : {}),
          ...(query
            ? {
                OR: [
                  { title: { contains: query } },
                  { author: { contains: query } },
                ],
              }
            : {}),
        },
        orderBy: [{ uploadDate: "desc" }, { title: "asc" }],
      })
    ).map(serializeBook),
  );

  if (!booksResult.ok) {
    return (
      <main className="admin-shell wide" id="main">
        <div className="page-topline">
          <div>
            <h1 className="site-title">Manage books</h1>
            <p className="muted small">Owner dashboard</p>
          </div>
          <AdminNav />
        </div>
        <div className="error-state">{booksResult.error.userMessage}</div>
      </main>
    );
  }

  const books = booksResult.data;

  return (
    <main className="admin-shell wide" id="main">
      <div className="page-topline">
        <div>
          <h1 className="site-title">Manage books</h1>
          <p className="muted small">{books.length.toLocaleString()} results</p>
        </div>
        <AdminNav />
      </div>

      <form className="admin-filterbar" action="/admin/books">
        <input className="field" type="search" name="q" defaultValue={query} placeholder="Search title or author" aria-label="Search books" />
        <select className="select" name="format" defaultValue={format} aria-label="Filter by format">
          <option value="">All formats</option>
          {BOOK_FORMATS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select className="select" name="category" defaultValue={category} aria-label="Filter by category">
          <option value="">All categories</option>
          {BOOK_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <button className="button primary" type="submit">
          Apply
        </button>
      </form>

      {books.length === 0 ? (
        <div className="empty-state">No books match those admin filters.</div>
      ) : (
        <div className="admin-book-list">
          {books.map((book) => (
            <article className="admin-book-row" key={book.id}>
              <Link className="admin-thumb cover-link" href={`/admin/books/${book.id}/edit`} aria-label={`Edit ${book.title}`}>
                <BookCover book={book} />
              </Link>
              <div className="admin-book-main">
                <Link className="book-title-link" href={`/admin/books/${book.id}/edit`}>
                  {book.title}
                </Link>
                <span className="book-author">By {book.author}</span>
              </div>
              <div className="admin-book-meta">
                <span>{book.format}</span>
                <span>{categoryLabel(book.category)}</span>
                <span>Published {formatDate(book.publicationDate)}</span>
                <span>Uploaded {formatDate(book.uploadDate)}</span>
              </div>
              <div className="admin-row-actions">
                <Link className="button" href={`/admin/books/${book.id}/edit`}>
                  Edit
                </Link>
                <AdminDeleteButton id={book.id} title={book.title} />
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
