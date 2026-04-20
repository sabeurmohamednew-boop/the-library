import { bookAuthors, type AuthorSource } from "@/lib/authors";
import { categoryLabel } from "@/lib/config";
import { formatPublicationDate } from "@/lib/formatPublicationDate";
import type { BookCategory } from "@/lib/types";

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanPunctuationSpacing(value: string) {
  return compactWhitespace(value)
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:!?])(?=[^\s"'\u2019\u201d)\]}])/g, "$1 ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\[\s+/g, "[")
    .replace(/\s+\]/g, "]");
}

export function displayText(value: string | null | undefined, fallback = "Unknown") {
  const clean = cleanPunctuationSpacing(String(value ?? ""));
  return clean || fallback;
}

export function displayBookTitle(title: string | null | undefined) {
  return displayText(title, "Untitled");
}

export function displayBookDescription(description: string | null | undefined) {
  return displayText(description, "");
}

export function displayAuthorName(author: string | null | undefined) {
  return displayText(author, "Unknown");
}

export function displayAuthorList(source: AuthorSource) {
  return bookAuthors(source).map(displayAuthorName).filter(Boolean);
}

export function displayAuthorLabel(source: AuthorSource) {
  const authors = displayAuthorList(source);
  return authors.length > 0 ? authors.join(", ") : "Unknown";
}

export function displayCategoryLabel(category: BookCategory | string) {
  return categoryLabel(category);
}

export function displayPublicationDate(value: string | Date | null | undefined) {
  return formatPublicationDate(value);
}
