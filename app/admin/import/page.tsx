import type { Metadata } from "next";
import Link from "next/link";
import { AdminImportForm } from "@/components/admin/AdminImportForm";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminNav } from "@/components/admin/AdminNav";
import { adminPasswordConfigured, isAdminSession } from "@/lib/adminAuth";
import { blobStoreConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private import",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminImportPage() {
  const configured = adminPasswordConfigured();
  const authenticated = configured ? await isAdminSession() : false;

  return (
    <main className="admin-shell" id="main">
      <div className="page-topline">
        <div>
          <h1 className="site-title">Private import</h1>
          <p className="muted small">Owner-only book upload</p>
        </div>
        {authenticated ? <AdminNav /> : <Link className="button" href="/">The Library</Link>}
      </div>

      {!configured ? (
        <div className="error-state">Set ADMIN_PASSWORD in the environment before using the import page.</div>
      ) : authenticated ? (
        <AdminImportForm blobConfigured={blobStoreConfigured()} />
      ) : (
        <AdminLogin />
      )}
    </main>
  );
}
