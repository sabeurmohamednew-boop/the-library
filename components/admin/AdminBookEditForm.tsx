"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS } from "@/lib/config";
import { markLibraryContentChanged } from "@/lib/clientFreshness";
import type { BookDTO } from "@/lib/types";
import { formatDate } from "@/lib/text";
import { uploadAdminBlob } from "@/lib/clientUploads";
import { publicationYearInputError, publicationYearInputValue, sanitizePublicationYearInput } from "@/lib/publicationYear";

type FieldErrors = Record<string, string[] | undefined>;

type AdminBookEditFormProps = {
  book: BookDTO;
  blobConfigured: boolean;
};

export function AdminBookEditForm({ book, blobConfigured }: AdminBookEditFormProps) {
  const router = useRouter();
  const bookFileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState<BookDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [replacementBook, setReplacementBook] = useState<File | null>(null);
  const [replacementCover, setReplacementCover] = useState<File | null>(null);
  const [publicationYear, setPublicationYear] = useState(() => publicationYearInputValue(book.publicationDate));

  function handleFileChange(event: ChangeEvent<HTMLInputElement>, kind: "book" | "cover") {
    const file = event.target.files?.[0] ?? null;
    if (kind === "book") {
      setReplacementBook(file);
    } else {
      setReplacementCover(file);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    setSaved(null);

    const formData = new FormData(event.currentTarget);
    formData.set("publicationDate", publicationYear.trim());

    if (!blobConfigured && (replacementBook?.size || replacementCover?.size)) {
      setSubmitting(false);
      setError("Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before replacing files.");
      return;
    }

    const publicationYearError = publicationYearInputError(publicationYear);
    if (publicationYearError) {
      setSubmitting(false);
      setFieldErrors({ publicationDate: [publicationYearError] });
      setError("Please fix the highlighted fields.");
      return;
    }

    try {
      const [bookBlob, coverBlob] = await Promise.all([
        replacementBook?.size ? uploadAdminBlob(replacementBook, "book", String(formData.get("title") ?? book.title)) : Promise.resolve(undefined),
        replacementCover?.size ? uploadAdminBlob(replacementCover, "cover", String(formData.get("title") ?? book.title)) : Promise.resolve(undefined),
      ]);
      // Files are uploaded to Vercel Blob first; the PATCH persists the returned descriptors with the metadata.
      const payload = {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        author: String(formData.get("author") ?? ""),
        format: String(formData.get("format") ?? ""),
        category: String(formData.get("category") ?? ""),
        pageCount: String(formData.get("pageCount") ?? ""),
        publicationDate: publicationYear.trim(),
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
      setPublicationYear(publicationYearInputValue(responsePayload.book.publicationDate));
      markLibraryContentChanged(responsePayload.book.updatedAt);
      setReplacementBook(null);
      setReplacementCover(null);
      if (bookFileInputRef.current) bookFileInputRef.current.value = "";
      if (coverFileInputRef.current) coverFileInputRef.current.value = "";
      router.refresh();
    } catch (uploadError) {
      setSubmitting(false);
      setError(uploadError instanceof Error ? uploadError.message : "The replacement files could not be uploaded.");
    }
  }

  function fieldError(name: string) {
    return fieldErrors[name]?.[0] ? <span className="field-error">{fieldErrors[name]?.[0]}</span> : null;
  }

  function handlePublicationYearChange(value: string) {
    const nextValue = sanitizePublicationYearInput(value);
    if (nextValue !== null) setPublicationYear(nextValue);
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
          <input
            ref={bookFileInputRef}
            className="field"
            type="file"
            name="bookFile"
            accept=".pdf,.epub,application/pdf,application/epub+zip"
            disabled={!blobConfigured}
            onChange={(event) => handleFileChange(event, "book")}
          />
          {fieldError("bookFile")}
        </label>

        <label className="label span-2">
          Replace cover
          <input
            ref={coverFileInputRef}
            className="field"
            type="file"
            name="coverFile"
            accept="image/png,image/jpeg,image/webp,image/avif"
            disabled={!blobConfigured}
            onChange={(event) => handleFileChange(event, "cover")}
          />
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
          Author(s)
          <input className="field" name="author" defaultValue={current.author} placeholder="Steven Slate, Mark W Scheeren" required />
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
          Publication year
          <input
            className="field"
            name="publicationDate"
            type="text"
            inputMode="numeric"
            pattern="-?[0-9]*"
            value={publicationYear}
            onChange={(event) => handlePublicationYearChange(event.target.value)}
            placeholder="2018"
          />
          <span className="muted small">Use negative values for BC (e.g. -500 = 500 BC)</span>
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
        <a className="button" href={`/books/${current.slug}`}>
          Details
        </a>
        <a className="button" href={`/read/${current.slug}`}>
          Reader
        </a>
        <a className="button" href="/admin/books">
          Manage books
        </a>
      </div>
    </form>
  );
}
