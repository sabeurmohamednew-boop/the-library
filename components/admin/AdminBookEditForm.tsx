"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS } from "@/lib/config";
import type { BookDTO } from "@/lib/types";
import { formatDate } from "@/lib/text";
import { uploadAdminBlob } from "@/lib/clientUploads";

type FieldErrors = Record<string, string[] | undefined>;

type AdminBookEditFormProps = {
  book: BookDTO;
  blobConfigured: boolean;
};

function dateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function AdminBookEditForm({ book, blobConfigured }: AdminBookEditFormProps) {
  const router = useRouter();
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
    const replacementBook = formData.get("bookFile") as File | null;
    const replacementCover = formData.get("coverFile") as File | null;

    if (!blobConfigured && (replacementBook?.size || replacementCover?.size)) {
      setSubmitting(false);
      setError("Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before replacing files.");
      return;
    }

    try {
      const [bookBlob, coverBlob] = await Promise.all([
        replacementBook?.size ? uploadAdminBlob(replacementBook, "book", String(formData.get("title") ?? book.title)) : Promise.resolve(undefined),
        replacementCover?.size ? uploadAdminBlob(replacementCover, "cover", String(formData.get("title") ?? book.title)) : Promise.resolve(undefined),
      ]);
      const payload = {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        author: String(formData.get("author") ?? ""),
        format: String(formData.get("format") ?? ""),
        category: String(formData.get("category") ?? ""),
        pageCount: String(formData.get("pageCount") ?? ""),
        publicationDate: String(formData.get("publicationDate") ?? ""),
        ...(bookBlob ? { bookBlob } : {}),
        ...(coverBlob ? { coverBlob } : {}),
      };
      console.info("[admin-book-edit-form]", "submitting", {
        id: book.id,
        slug: book.slug,
        title: payload.title,
        author: payload.author,
        format: payload.format,
        category: payload.category,
        pageCount: payload.pageCount,
        publicationDate: payload.publicationDate,
        hasBookBlob: Boolean(bookBlob),
        hasCoverBlob: Boolean(coverBlob),
      });

      const response = await fetch(`/api/admin/books/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responsePayload = (await response.json().catch(() => null)) as { error?: string; fieldErrors?: FieldErrors; book?: BookDTO } | null;
      setSubmitting(false);

      if (!response.ok || !responsePayload?.book) {
        setError(responsePayload?.error ?? "The book could not be saved.");
        setFieldErrors(responsePayload?.fieldErrors ?? {});
        return;
      }

      setSaved(responsePayload.book);
      router.refresh();
    } catch (uploadError) {
      setSubmitting(false);
      setError(uploadError instanceof Error ? uploadError.message : "The replacement files could not be uploaded.");
    }
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
      {!blobConfigured ? (
        <div className="notice">
          Vercel Blob is not configured. Metadata can still be edited, but replacing files requires BLOB_READ_WRITE_TOKEN.
        </div>
      ) : null}

      <div className="form-grid">
        <label className="label span-2">
          Replace book file
          <input className="field" type="file" name="bookFile" accept=".pdf,.epub,application/pdf,application/epub+zip" disabled={!blobConfigured} />
          {fieldError("bookFile")}
        </label>

        <label className="label span-2">
          Replace cover
          <input className="field" type="file" name="coverFile" accept="image/png,image/jpeg,image/webp,image/avif" disabled={!blobConfigured} />
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
