"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { BOOK_CATEGORIES, BOOK_FORMATS } from "@/lib/config";
import type { BookDTO } from "@/lib/types";

type FieldErrors = Record<string, string[] | undefined>;

function inferTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function AdminImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [format, setFormat] = useState("PDF");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<BookDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".epub")) setFormat("EPUB");
    if (lower.endsWith(".pdf")) setFormat("PDF");
    if (!title) setTitle(inferTitle(file.name));

    setExtracting(true);
    const formData = new FormData();
    formData.set("bookFile", file);
    const response = await fetch("/api/admin/books/metadata", {
      method: "POST",
      body: formData,
    });
    const metadata = (await response.json().catch(() => null)) as { title?: string; author?: string; pageCount?: number; format?: string } | null;
    setExtracting(false);

    if (!response.ok || !metadata) return;
    if (metadata.format === "PDF" || metadata.format === "EPUB") setFormat(metadata.format);
    if (metadata.title && !title) setTitle(metadata.title);
    if (metadata.author && !author) setAuthor(metadata.author);
    if (metadata.pageCount && !pageCount) setPageCount(String(metadata.pageCount));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setFieldErrors({});
    setCreated(null);

    const formData = new FormData(event.currentTarget);
    formData.set("title", title);
    formData.set("author", author);
    formData.set("pageCount", pageCount);
    formData.set("format", format);

    const bookFile = formData.get("bookFile") as File | null;
    const coverFile = formData.get("coverFile") as File | null;
    const nextFieldErrors: FieldErrors = {};

    if (!bookFile?.size) nextFieldErrors.bookFile = ["A PDF or EPUB file is required."];
    if (!coverFile?.size) nextFieldErrors.coverFile = ["A cover image is required."];
    if (!title.trim()) nextFieldErrors.title = ["Title is required."];
    if (!author.trim()) nextFieldErrors.author = ["Author is required."];
    if (!pageCount || Number(pageCount) < 1) nextFieldErrors.pageCount = ["Page count is required."];
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

    const response = await fetch("/api/admin/books", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; fieldErrors?: FieldErrors; book?: BookDTO } | null;
    setSubmitting(false);

    if (!response.ok || !payload?.book) {
      setError(payload?.error ?? "The book could not be imported.");
      setFieldErrors(payload?.fieldErrors ?? {});
      return;
    }

    setCreated(payload.book);
    formRef.current?.reset();
    setTitle("");
    setAuthor("");
    setPageCount("");
    setFormat("PDF");
  }

  function fieldError(name: string) {
    return fieldErrors[name]?.[0] ? <span className="field-error">{fieldErrors[name]?.[0]}</span> : null;
  }

  return (
    <form ref={formRef} className="admin-form" onSubmit={handleSubmit}>
      <div className="notice">
        This owner-only route writes uploaded files to local storage and creates a database record immediately.
      </div>

      <div className="form-grid">
        <label className="label span-2">
          Book file
          <input className="field" type="file" name="bookFile" accept=".pdf,.epub,application/pdf,application/epub+zip" required onChange={(event) => handleFileChange(event.target.files?.[0])} />
          {extracting ? <span className="muted small">Checking metadata</span> : null}
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
          Author
          <input className="field" name="author" value={author} onChange={(event) => setAuthor(event.target.value)} required />
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
          <input className="field" name="publicationDate" type="date" required />
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
          Imported <Link href={`/books/${created.slug}`}>{created.title}</Link>.
          <div className="action-row compact">
            <Link className="button" href={`/books/${created.slug}`}>
              Details
            </Link>
            <Link className="button" href={`/read/${created.slug}`}>
              Reader
            </Link>
            <Link className="button" href="/admin/books">
              Manage books
            </Link>
          </div>
        </div>
      ) : null}

      <div className="action-row">
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting ? "Importing" : "Import book"}
        </button>
        <Link className="button" href="/">
          The Library
        </Link>
        <Link className="button" href="/admin/books">
          Manage books
        </Link>
      </div>
    </form>
  );
}
