import type { ReaderAnnotation, ReaderBookDTO, ReaderBookmark, ReaderHighlightColor, ReaderLocator, ReaderState } from "@/lib/types";

type ReaderExportShape = {
  book?: {
    id?: unknown;
    slug?: unknown;
    title?: unknown;
    author?: unknown;
    format?: unknown;
  };
  progress?: unknown;
  annotations?: unknown;
  bookmarks?: unknown;
};

type ImportCounts = {
  addedAnnotations: number;
  addedBookmarks: number;
  mergedAnnotations: number;
  progressUpdated: boolean;
  skippedDuplicates: number;
};

export type ReaderAnnotationImportResult =
  | {
      ok: true;
      annotations: ReaderAnnotation[];
      bookmarks: ReaderBookmark[];
      progress: number;
      pdfPage?: number;
      message: string;
      counts: ImportCounts;
    }
  | {
      ok: false;
      message: string;
    };

const HIGHLIGHT_COLORS: ReaderHighlightColor[] = ["yellow", "green", "blue", "pink"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanImportedText(value: string, maxLength = 4000) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function locatorKey(locator: ReaderLocator) {
  if (locator.type === "pdf-page") return `pdf:${locator.page}`;
  if (locator.type === "epub-cfi") return `epub:${locator.cfi}`;
  return `epub-href:${locator.href}`;
}

function parseLocator(value: unknown, context: string): ReaderLocator {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`${context} has an invalid location.`);
  }

  if (value.type === "pdf-page" && typeof value.page === "number" && Number.isFinite(value.page) && value.page > 0) {
    return { type: "pdf-page", page: Math.round(value.page) };
  }

  if (value.type === "epub-cfi" && typeof value.cfi === "string" && value.cfi.trim()) {
    return { type: "epub-cfi", cfi: value.cfi.trim() };
  }

  if (value.type === "epub-href" && typeof value.href === "string" && value.href.trim()) {
    return { type: "epub-href", href: value.href.trim() };
  }

  throw new Error(`${context} has an invalid location.`);
}

function requireString(value: unknown, field: string, context: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context} is missing ${field}.`);
  }
  return value.trim();
}

function requireProgress(value: unknown, context: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} has invalid progress.`);
  }
  return clampProgress(value);
}

function optionalProgress(value: unknown) {
  if (typeof value === "undefined") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("The exported progress value is invalid.");
  }
  return clampProgress(value);
}

function parseAnnotation(value: unknown, index: number): ReaderAnnotation {
  const context = `Annotation ${index + 1}`;
  if (!isRecord(value)) throw new Error(`${context} is malformed.`);
  if (value.kind !== "highlight" && value.kind !== "note") throw new Error(`${context} has an invalid type.`);
  if (!HIGHLIGHT_COLORS.includes(value.color as ReaderHighlightColor)) throw new Error(`${context} has an invalid color.`);

  const note = typeof value.note === "string" ? cleanImportedText(value.note, 1200) : undefined;

  return {
    id: requireString(value.id, "id", context),
    kind: value.kind,
    quote: cleanImportedText(requireString(value.quote, "quote", context)),
    note,
    color: value.color as ReaderHighlightColor,
    createdAt: requireString(value.createdAt, "createdAt", context),
    updatedAt: requireString(value.updatedAt, "updatedAt", context),
    locator: parseLocator(value.locator, context),
    progress: requireProgress(value.progress, context),
    label: requireString(value.label, "label", context),
  };
}

function parseBookmark(value: unknown, index: number): ReaderBookmark {
  const context = `Bookmark ${index + 1}`;
  if (!isRecord(value)) throw new Error(`${context} is malformed.`);

  return {
    id: requireString(value.id, "id", context),
    label: requireString(value.label, "label", context),
    createdAt: requireString(value.createdAt, "createdAt", context),
    locator: parseLocator(value.locator, context),
    progress: requireProgress(value.progress, context),
  };
}

function annotationExactKey(annotation: ReaderAnnotation) {
  return [annotation.kind, locatorKey(annotation.locator), cleanImportedText(annotation.quote), annotation.color, cleanImportedText(annotation.note ?? "", 1200)].join("|");
}

function annotationBaseKey(annotation: ReaderAnnotation) {
  return [annotation.kind, locatorKey(annotation.locator), cleanImportedText(annotation.quote), annotation.color].join("|");
}

function mergeNotes(existingNote: string | undefined, importedNote: string | undefined) {
  const existing = cleanImportedText(existingNote ?? "", 1200);
  const imported = cleanImportedText(importedNote ?? "", 1200);

  if (!imported || existing === imported || existing.includes(imported)) {
    return { changed: false, note: existing || undefined };
  }

  if (!existing || imported.includes(existing)) {
    return { changed: true, note: imported };
  }

  return { changed: true, note: cleanImportedText(`${existing} Imported: ${imported}`, 1200) };
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function importMessage(counts: ImportCounts) {
  const importedParts: string[] = [];
  if (counts.addedAnnotations) importedParts.push(plural(counts.addedAnnotations, "annotation"));
  if (counts.addedBookmarks) importedParts.push(plural(counts.addedBookmarks, "bookmark"));

  const parts = [importedParts.length ? `Imported ${importedParts.join(" and ")}.` : counts.progressUpdated ? "Imported progress." : "No new data imported."];
  if (importedParts.length && counts.progressUpdated) parts.push("Updated progress.");
  if (counts.mergedAnnotations) parts.push(`Merged ${plural(counts.mergedAnnotations, "note")}.`);
  if (counts.skippedDuplicates) parts.push(`Skipped ${plural(counts.skippedDuplicates, "duplicate")}.`);

  return parts.join(" ");
}

function validateBookMatch(payload: ReaderExportShape, book: ReaderBookDTO): string | null {
  if (!isRecord(payload.book)) return "This is not a reader notes export.";

  const importedSlug = typeof payload.book.slug === "string" ? payload.book.slug.trim() : "";
  const importedId = typeof payload.book.id === "string" ? payload.book.id.trim() : "";

  if (!importedSlug && !importedId) {
    return "This export is missing a book identifier.";
  }

  if (importedSlug && importedSlug !== book.slug) {
    return `This file is for another book (${importedSlug}).`;
  }

  if (importedId && importedId !== book.id) {
    return "This file is for another book.";
  }

  return null;
}

export function importReaderAnnotationsFromJson(
  jsonText: string,
  {
    book,
    currentState,
    makeId,
  }: {
    book: ReaderBookDTO;
    currentState: ReaderState;
    makeId: () => string;
  },
): ReaderAnnotationImportResult {
  if (!jsonText.trim()) {
    return { ok: false, message: "The selected file is empty." };
  }

  let payload: ReaderExportShape;
  try {
    payload = JSON.parse(jsonText) as ReaderExportShape;
  } catch {
    return { ok: false, message: "Choose a valid JSON reader export." };
  }

  if (!isRecord(payload)) {
    return { ok: false, message: "This is not a reader notes export." };
  }

  const bookError = validateBookMatch(payload, book);
  if (bookError) return { ok: false, message: bookError };

  const hasAnnotations = Object.prototype.hasOwnProperty.call(payload, "annotations");
  const hasBookmarks = Object.prototype.hasOwnProperty.call(payload, "bookmarks");
  const hasProgress = Object.prototype.hasOwnProperty.call(payload, "progress");
  if (!hasAnnotations && !hasBookmarks && !hasProgress) {
    return { ok: false, message: "No reader data was found in this file." };
  }

  if (hasAnnotations && !Array.isArray(payload.annotations)) {
    return { ok: false, message: "The notes and highlights in this file are malformed." };
  }

  if (hasBookmarks && !Array.isArray(payload.bookmarks)) {
    return { ok: false, message: "The bookmarks in this file are malformed." };
  }

  let importedAnnotations: ReaderAnnotation[];
  let importedBookmarks: ReaderBookmark[];
  let importedProgress: number | null;
  try {
    importedAnnotations = Array.isArray(payload.annotations) ? payload.annotations.map(parseAnnotation) : [];
    importedBookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks.map(parseBookmark) : [];
    importedProgress = optionalProgress(payload.progress);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "This reader export is malformed." };
  }

  const counts: ImportCounts = {
    addedAnnotations: 0,
    addedBookmarks: 0,
    mergedAnnotations: 0,
    progressUpdated: false,
    skippedDuplicates: 0,
  };

  const nextAnnotations = [...currentState.annotations];
  const exactAnnotationKeys = new Set(nextAnnotations.map(annotationExactKey));
  const baseAnnotationIndexes = new Map(nextAnnotations.map((annotation, index) => [annotationBaseKey(annotation), index]));
  const now = new Date().toISOString();

  for (const imported of importedAnnotations) {
    const exactKey = annotationExactKey(imported);
    if (exactAnnotationKeys.has(exactKey)) {
      counts.skippedDuplicates += 1;
      continue;
    }

    const baseKey = annotationBaseKey(imported);
    const existingIndex = baseAnnotationIndexes.get(baseKey);
    if (typeof existingIndex === "number") {
      const existing = nextAnnotations[existingIndex];
      const merged = mergeNotes(existing.note, imported.note);
      if (merged.changed) {
        nextAnnotations[existingIndex] = {
          ...existing,
          kind: merged.note ? "note" : existing.kind,
          note: merged.note,
          updatedAt: now,
        };
        exactAnnotationKeys.add(annotationExactKey(nextAnnotations[existingIndex]));
        counts.mergedAnnotations += 1;
      } else {
        counts.skippedDuplicates += 1;
      }
      exactAnnotationKeys.add(exactKey);
      continue;
    }

    const nextAnnotation = { ...imported, id: makeId() };
    nextAnnotations.push(nextAnnotation);
    exactAnnotationKeys.add(annotationExactKey(nextAnnotation));
    baseAnnotationIndexes.set(annotationBaseKey(nextAnnotation), nextAnnotations.length - 1);
    counts.addedAnnotations += 1;
  }

  const nextBookmarks = [...currentState.bookmarks];
  const bookmarkKeys = new Set(nextBookmarks.map((bookmark) => locatorKey(bookmark.locator)));

  for (const imported of importedBookmarks) {
    const key = locatorKey(imported.locator);
    if (bookmarkKeys.has(key)) {
      counts.skippedDuplicates += 1;
      continue;
    }

    nextBookmarks.push({ ...imported, id: makeId() });
    bookmarkKeys.add(key);
    counts.addedBookmarks += 1;
  }

  const nextProgress = importedProgress !== null && importedProgress > (currentState.progress || 0) ? importedProgress : currentState.progress || 0;
  counts.progressUpdated = nextProgress !== (currentState.progress || 0);
  const pdfPage =
    counts.progressUpdated && book.format === "PDF" && book.pageCount > 0
      ? Math.max(1, Math.min(book.pageCount, Math.round(nextProgress * Math.max(1, book.pageCount - 1)) + 1))
      : undefined;

  return {
    ok: true,
    annotations: nextAnnotations,
    bookmarks: nextBookmarks,
    progress: nextProgress,
    pdfPage,
    message: importMessage(counts),
    counts,
  };
}
