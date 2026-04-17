"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AdminDeleteButtonProps = {
  id: string;
  title: string;
  redirectTo?: string;
};

export function AdminDeleteButton({ id, title, redirectTo = "/admin/books" }: AdminDeleteButtonProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteBook() {
    const confirmed = window.confirm(`Delete "${title}"? This removes the database record and unreferenced stored files.`);
    if (!confirmed) return;

    setDeleting(true);
    setError("");

    const response = await fetch(`/api/admin/books/${id}`, {
      method: "DELETE",
    });

    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setDeleting(false);

    if (!response.ok) {
      setError(payload?.error ?? "The book could not be deleted.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <span className="inline-action">
      <button className="button danger" type="button" onClick={deleteBook} disabled={deleting}>
        {deleting ? "Deleting" : "Delete"}
      </button>
      {error ? <span className="muted small">{error}</span> : null}
    </span>
  );
}
