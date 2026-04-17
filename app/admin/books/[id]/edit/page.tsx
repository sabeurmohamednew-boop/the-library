import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminBookEditForm } from "@/components/admin/AdminBookEditForm";
import { AdminDeleteButton } from "@/components/admin/AdminDeleteButton";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminNav } from "@/components/admin/AdminNav";
import { BookCover } from "@/components/library/BookCover";
import { adminPasswordConfigured, isAdminSession } from "@/lib/adminAuth";
import { getBookById } from "@/lib/books";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit book",
  robots: {
    index: false,
    follow: false,
  },
};

type EditBookPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditBookPage({ params }: EditBookPageProps) {
  const configured = adminPasswordConfigured();
  const authenticated = configured ? await isAdminSession() : false;

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
          <h1 className="site-title">Edit book</h1>
          <Link className="button" href="/">
            The Library
          </Link>
        </div>
        <AdminLogin />
      </main>
    );
  }

  const { id } = await params;
  const book = await getBookById(id);
  if (!book) notFound();

  return (
    <main className="admin-shell" id="main">
      <div className="page-topline">
        <div>
          <h1 className="site-title">Edit book</h1>
          <p className="muted small">{book.title}</p>
        </div>
        <AdminNav />
      </div>

      <section className="admin-edit-layout">
        <div>
          <div className="details-cover cover-frame">
            <BookCover book={book} />
          </div>
          <div className="section-heading">
            <AdminDeleteButton id={book.id} title={book.title} />
          </div>
        </div>
        <AdminBookEditForm book={book} />
      </section>
    </main>
  );
}
