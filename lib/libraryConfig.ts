import type { BookCategory, BookFormat } from "@/lib/types";

export const TRUNCATION_LIMITS = {
  title: 72,
  description: 150,
  author: 42,
} as const;

export const BOOK_FORMATS: { value: BookFormat; label: string }[] = [
  { value: "PDF", label: "PDF" },
  { value: "EPUB", label: "EPUB" },
];

export const BOOK_CATEGORY_VALUES = [
  "SELF_IMPROVEMENT",
  "PHILOSOPHY",
  "PHILOSOPHICAL_FICTION",
  "PSYCHOLOGY_BEHAVIOR",
  "FINANCE_BUSINESS",
  "STRATEGY_POWER",
  "ADDICTION_RECOVERY",
] as const;

export const BOOK_CATEGORIES: { value: BookCategory; label: string }[] = [
  { value: "SELF_IMPROVEMENT", label: "Self-Improvement" },
  { value: "PHILOSOPHY", label: "Philosophy" },
  { value: "PHILOSOPHICAL_FICTION", label: "Philosophical Fiction" },
  { value: "PSYCHOLOGY_BEHAVIOR", label: "Psychology & Behavior" },
  { value: "FINANCE_BUSINESS", label: "Finance & Business" },
  { value: "STRATEGY_POWER", label: "Strategy & Power" },
  { value: "ADDICTION_RECOVERY", label: "Addiction & Recovery" },
];

export const LIBRARY_PAGE_SIZE = {
  gallery: 12,
  list: 80,
  cover: 48,
} as const;

function fallbackCategoryLabel(category: string) {
  return category
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function categoryLabel(category: BookCategory | string) {
  return BOOK_CATEGORIES.find((item) => item.value === category)?.label ?? fallbackCategoryLabel(category);
}
