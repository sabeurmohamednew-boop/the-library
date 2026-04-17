import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      <Link className="button" href="/" prefetch={false}>
        The Library
      </Link>
      <Link className="button" href="/admin" prefetch={false}>
        Dashboard
      </Link>
      <Link className="button" href="/admin/import" prefetch={false}>
        Import
      </Link>
      <Link className="button" href="/admin/books" prefetch={false}>
        Manage books
      </Link>
    </nav>
  );
}
