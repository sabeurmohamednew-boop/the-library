import Link from "next/link";

export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      <Link className="button" href="/">
        The Library
      </Link>
      <Link className="button" href="/admin">
        Dashboard
      </Link>
      <Link className="button" href="/admin/import">
        Import
      </Link>
      <Link className="button" href="/admin/books">
        Manage books
      </Link>
    </nav>
  );
}
