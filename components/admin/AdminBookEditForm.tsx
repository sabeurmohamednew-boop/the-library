"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS } from "@/lib/config";
import type { BookDTO } from "@/lib/types";
import { formatDate } from "@/lib/text";

type FieldErrors = Record<string, string[] | undefined>;

type AdminBookEditFormProps = {
  book: BookDTO;
};

function dateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function AdminBookEditForm({ book }: AdminBookEditFormProps) {
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<BookDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    setSaved(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/books/${book.id}`, {
      method: "PATCH",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; fieldErrors?: FieldErrors; book?: BookDTO } | null;
    setSubmitting(false);

    if (!response.ok || !payload?.book) {
      setError(payload?.error ?? "The book could not be saved.");
      setFieldErrors(payload?.fieldErrors ?? {});
      return;
    }

    setSaved(payload.book);
  }

  function fieldError(name: string) {
    return fieldErrors[name]?.[0] ? <span className="field-error">{fieldErrors[name]?.[0]}</span> : null;
  }

  const current = saved ?? book;

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="notice">
        The slug stays unchanged when the title changes, so existing reader and detail links remain stable.
      </div>

      <div className="form-grid">
        <label className="label span-2">
          Replace book file
          <input className="field" type="file" name="bookFile" accept=".pdf,.epub,application/pdf,application/epub+zip" />
          {fieldError("bookFile")}
        </label>

        <label className="label span-2">
          Replace cover
          <input className="field" type="file" name="coverFile" accept="image/png,image/jpeg,image/webp,image/avif" />
          {fieldError("coverFile")}
        </label>

        <label className="label span-2">
          Title
          <input className="field" name="title" defaultValue={current.title} required />
          {fieldError("title")}
        </label>

        <label className="label span-2">
          Description
          <textarea className="textarea" name="description" defaultValue={current.description} required />
          {fieldError("description")}
        </label>

        <label className="label">
          Author
          <input className="field" name="author" defaultValue={current.author} required />
          {fieldError("author")}
        </label>

        <label className="label">
          Format
          <select className="select" name="format" defaultValue={current.format} required>
            {BOOK_FORMATS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {fieldError("format")}
        </label>

        <label className="label">
          Page count
          <input className="field" name="pageCount" type="number" min="1" inputMode="numeric" defaultValue={current.pageCount} required />
          {fieldError("pageCount")}
        </label>

        <label className="label">
          Publication date
          <input className="field" name="publicationDate" type="date" defaultValue={dateInputValue(current.publicationDate)} required />
          {fieldError("publicationDate")}
        </label>

        <label className="label span-2">
          Category
          <select className="select" name="category" defaultValue={current.category} required>
            {BOOK_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {fieldError("category")}
        </label>
      </div>

      {error ? <p className="error-state">{error}</p> : null}
      {saved ? (
        <p className="notice">
          Saved {saved.title}. Uploaded {formatDate(saved.uploadDate)}.
        </p>
      ) : null}

      <div className="action-row">
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? "Saving" : "Save changes"}
        </button>
        <Link className="button" href={`/books/${current.slug}`}>
          Details
        </Link>
        <Link className="button" href={`/read/${current.slug}`}>
          Reader
        </Link>
        <Link className="button" href="/admin/books">
          Manage books
        </Link>
      </div>
    </form>
  );
}
