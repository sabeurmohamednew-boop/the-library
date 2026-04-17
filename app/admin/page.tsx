import type { Metadata } from "next";
import Link from "next/link";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminPasswordConfigured, isAdminSession } from "@/lib/adminAuth";
import { prisma } from "@/lib/db";
import { safeRuntime } from "@/lib/runtime";
import { formatDate } from "@/lib/text";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
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
          <h1 className="site-title">Admin</h1>
          <Link className="button" href="/">
            The Library
          </Link>
        </div>
        <AdminLogin />
      </main>
    );
  }

  const stats = await safeRuntime("admin.dashboard", async () => {
    const [bookCount, pdfCount, epubCount, latestBook] = await Promise.all([
      prisma.book.count(),
      prisma.book.count({ where: { format: "PDF" } }),
      prisma.book.count({ where: { format: "EPUB" } }),
      prisma.book.findFirst({ orderBy: { uploadDate: "desc" } }),
    ]);

    return { bookCount, pdfCount, epubCount, latestBook };
  });

  if (!stats.ok) {
    return (
      <main className="admin-shell" id="main">
        <div className="page-topline">
          <div>
            <h1 className="site-title">Admin</h1>
            <p className="muted small">Owner dashboard</p>
          </div>
          <AdminNav />
        </div>
        <div className="error-state">{stats.error.userMessage}</div>
      </main>
    );
  }

  const { bookCount, pdfCount, epubCount, latestBook } = stats.data;

  return (
    <main className="admin-shell" id="main">
      <div className="page-topline">
        <div>
          <h1 className="site-title">Admin</h1>
          <p className="muted small">Owner dashboard</p>
        </div>
        <AdminNav />
      </div>

      <section className="admin-stat-grid" aria-label="Library summary">
        <div className="admin-stat">
          <span>Books</span>
          <strong>{bookCount.toLocaleString()}</strong>
        </div>
        <div className="admin-stat">
          <span>PDF</span>
          <strong>{pdfCount.toLocaleString()}</strong>
        </div>
        <div className="admin-stat">
          <span>EPUB</span>
          <strong>{epubCount.toLocaleString()}</strong>
        </div>
        <div className="admin-stat">
          <span>Last upload</span>
          <strong>{latestBook ? formatDate(latestBook.uploadDate) : "None"}</strong>
        </div>
      </section>

      <section className="admin-actions" aria-label="Admin actions">
        <Link className="button primary" href="/admin/import">
          Import a book
        </Link>
        <Link className="button" href="/admin/books">
          Manage books
        </Link>
      </section>
    </main>
  );
}
