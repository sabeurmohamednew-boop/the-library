"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS } from "@/lib/config";
import { normalizeAuthorsForStorage } from "@/lib/authors";
import { markLibraryContentChanged } from "@/lib/clientFreshness";
import { uploadAdminBlob } from "@/lib/clientUploads";
import { publicationDateInputError, sanitizePublicationYearInput } from "@/lib/publicationYear";
import type { BookDTO } from "@/lib/types";

type FieldErrors = Record<string, string[] | undefined>;

function inferTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type AdminImportFormProps = {
  blobConfigured: boolean;
};

export function AdminImportForm({ blobConfigured }: AdminImportFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [format, setFormat] = useState("PDF");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<BookDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(file: File | undefined) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".epub")) setFormat("EPUB");
    if (lower.endsWith(".pdf")) setFormat("PDF");
    if (!title) setTitle(inferTitle(file.name));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    setCreated(null);

    if (!blobConfigured) {
      setSubmitting(false);
      setError("Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before importing books.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("title", title);
    formData.set("author", author);
    formData.set("pageCount", pageCount);
    formData.set("publicationDate", publicationDate.trim());
    formData.set("format", format);

    const bookFile = formData.get("bookFile") as File | null;
    const coverFile = formData.get("coverFile") as File | null;
    const nextFieldErrors: FieldErrors = {};

    if (!bookFile?.size) nextFieldErrors.bookFile = ["A PDF or EPUB file is required."];
    if (!coverFile?.size) nextFieldErrors.coverFile = ["A cover image is required."];
    if (!title.trim()) nextFieldErrors.title = ["Title is required."];
    if (!normalizeAuthorsForStorage(author)) nextFieldErrors.author = ["Author is required."];
    if (!pageCount || Number(pageCount) < 1) nextFieldErrors.pageCount = ["Page count is required."];
    const publicationDateError = publicationDateInputError(publicationDate);
    if (publicationDateError) nextFieldErrors.publicationDate = [publicationDateError];
    if (bookFile?.size) {
      const lower = bookFile.name.toLowerCase();
      if ((format === "PDF" && !lower.endsWith(".pdf")) || (format === "EPUB" && !lower.endsWith(".epub"))) {
        nextFieldErrors.bookFile = [`The selected book file must be a ${format}.`];
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setSubmitting(false);
      setFieldErrors(nextFieldErrors);
      setError("Please fix the highlighted fields.");
      return;
    }

    try {
      const [bookBlob, coverBlob] = await Promise.all([
        uploadAdminBlob(bookFile as File, "book", title),
        uploadAdminBlob(coverFile as File, "cover", title),
      ]);

      const response = await fetch("/api/admin/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: String(formData.get("description") ?? ""),
          author,
          format,
          category: String(formData.get("category") ?? ""),
          pageCount,
          publicationDate: publicationDate.trim(),
          bookBlob,
          coverBlob,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; fieldErrors?: FieldErrors; book?: BookDTO } | null;
      setSubmitting(false);

      if (!response.ok || !payload?.book) {
        setError(payload?.error ?? "The book could not be imported.");
        setFieldErrors(payload?.fieldErrors ?? {});
        return;
      }

      setCreated(payload.book);
      markLibraryContentChanged(payload.book.updatedAt);
      formRef.current?.reset();
      setTitle("");
      setAuthor("");
      setPageCount("");
      setPublicationDate("");
      setFormat("PDF");
    } catch (uploadError) {
      setSubmitting(false);
      setError(uploadError instanceof Error ? uploadError.message : "The files could not be uploaded.");
    }
  }

  function fieldError(name: string) {
    return fieldErrors[name]?.[0] ? <span className="field-error">{fieldErrors[name]?.[0]}</span> : null;
  }

  function handlePublicationDateChange(value: string) {
    const nextValue = sanitizePublicationYearInput(value);
    if (nextValue !== null) setPublicationDate(nextValue);
  }

  return (
    <form ref={formRef} className="admin-form" onSubmit={handleSubmit}>
      <div className="notice">
        This owner-only route uploads files to Vercel Blob and creates a database record immediately.
      </div>
      {!blobConfigured ? (
        <div className="error-state">Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel before importing books.</div>
      ) : null}

      <div className="form-grid">
        <label className="label span-2">
          Book file
          <input className="field" type="file" name="bookFile" accept=".pdf,.epub,application/pdf,application/epub+zip" required onChange={(event) => handleFileChange(event.target.files?.[0])} />
          {fieldError("bookFile")}
        </label>

        <label className="label span-2">
          Cover image
          <input className="field" type="file" name="coverFile" accept="image/png,image/jpeg,image/webp,image/avif" required />
          {fieldError("coverFile")}
        </label>

        <label className="label span-2">
          Title
          <input className="field" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          {fieldError("title")}
        </label>

        <label className="label span-2">
          Description
          <textarea className="textarea" name="description" required />
          {fieldError("description")}
        </label>

        <label className="label">
          Author(s)
          <input className="field" name="author" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Steven Slate, Mark W Scheeren" required />
          {fieldError("author")}
        </label>

        <label className="label">
          Format
          <select className="select" name="format" value={format} onChange={(event) => setFormat(event.target.value)} required>
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
          <input className="field" name="pageCount" type="number" min="1" inputMode="numeric" value={pageCount} onChange={(event) => setPageCount(event.target.value)} required />
          {fieldError("pageCount")}
        </label>

        <label className="label">
          Publication date
          <input
            className="field"
            name="publicationDate"
            type="text"
            inputMode="numeric"
            value={publicationDate}
            onChange={(event) => handlePublicationDateChange(event.target.value)}
            placeholder="2018 or 15/11/2018"
          />
          <span className="muted small">Use a year, dd/mm/yyyy, or a negative year for BC (e.g. -500 = 500 BC)</span>
          {fieldError("publicationDate")}
        </label>

        <label className="label span-2">
          Category
          <select className="select" name="category" required>
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
      {created ? (
        <div className="notice">
          Imported <a href={`/books/${created.slug}`}>{created.title}</a>.
          <div className="action-row compact">
            <a className="button" href={`/books/${created.slug}`}>
              Details
            </a>
            <a className="button" href={`/read/${created.slug}`}>
              Reader
            </a>
            <a className="button" href="/admin/books">
              Manage books
            </a>
          </div>
        </div>
      ) : null}

      <div className="action-row">
        <button className="button primary" type="submit" disabled={submitting || !blobConfigured}>
          {submitting ? "Uploading" : "Import book"}
        </button>
        <Link className="button" href="/" prefetch={false}>
          The Library
        </Link>
        <Link className="button" href="/admin/books" prefetch={false}>
          Manage books
        </Link>
      </div>
    </form>
  );
}
