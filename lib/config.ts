import type { BookCategory, BookFormat, ReaderPreferences } from "@/lib/types";

export const SITE_NAME = "The Library";

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

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  theme: "light",
  layout: "paginated",
  zoom: 100,
  fitWidth: true,
  dualPage: false,
  brightness: 100,
  fontFamily: "original",
  fontSize: 100,
  lineHeight: 1.55,
  margin: 32,
  textAlign: "left",
  paragraphSpacing: 0.75,
  wordSpacing: 0,
  letterSpacing: 0,
  originalFormatting: true,
  normalizeText: false,
  progressDisplay: "percentage",
  orientation: "auto",
  pageTurnAnimation: "slide",
  showControls: true,
  immersiveMode: false,
  keepScreenAwake: true,
  tapZones: true,
  swipePaging: true,
  volumeKeyPaging: false,
  readAloudAutoStart: false,
  readAloudAutoTurn: false,
  readAloudRate: 1,
  readAloudSkipSeconds: 15,
};

export const LIBRARY_PAGE_SIZE = {
  gallery: 48,
  list: 120,
  cover: 96,
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
