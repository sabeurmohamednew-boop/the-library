"use client";

import { DEFAULT_READER_PREFERENCES } from "@/lib/config";
import type { ReaderState } from "@/lib/types";

export const BOOKMARKED_BOOKS_KEY = "library:bookmarked-books";
export const READER_STATE_PREFIX = "library:reader:";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readerStateKey(slug: string) {
  return `${READER_STATE_PREFIX}${slug}`;
}

function createDefaultReaderState(slug: string): ReaderState {
  return {
    ...DEFAULT_READER_PREFERENCES,
    slug,
    progress: 0,
    pdfPage: 1,
    bookmarks: [],
    annotations: [],
    stats: {
      minutesRead: 0,
      sessions: 0,
      streak: 0,
    },
    lastOpenedAt: new Date().toISOString(),
  };
}

function normalizeReaderState(slug: string, state: Partial<ReaderState> | null | undefined, fallback?: ReaderState): ReaderState {
  const base = fallback ?? createDefaultReaderState(slug);
  const defaultStats = {
    minutesRead: 0,
    sessions: 0,
    streak: 0,
  };
  const next = {
    ...DEFAULT_READER_PREFERENCES,
    ...base,
    ...(state ?? {}),
    slug,
    bookmarks: Array.isArray(state?.bookmarks) ? state.bookmarks : base.bookmarks,
    annotations: Array.isArray(state?.annotations) ? state.annotations : [],
    stats: {
      ...defaultStats,
      ...(base.stats ?? {}),
      ...(state?.stats ?? {}),
    },
    lastOpenedAt: typeof state?.lastOpenedAt === "string" ? state.lastOpenedAt : base.lastOpenedAt,
  };

  return next;
}

export function loadReaderState(slug: string, fallback?: ReaderState): ReaderState {
  const state = readJson<Partial<ReaderState> | null>(readerStateKey(slug), null);
  return normalizeReaderState(slug, state, fallback);
}

export function saveReaderState(slug: string, state: ReaderState) {
  writeJson(readerStateKey(slug), state);
}

export function loadBookmarkedSlugs() {
  return new Set(readJson<string[]>(BOOKMARKED_BOOKS_KEY, []));
}

export function saveBookmarkedSlugs(slugs: Set<string>) {
  writeJson(BOOKMARKED_BOOKS_KEY, Array.from(slugs));
}

export function setBookBookmarked(slug: string, bookmarked: boolean) {
  const slugs = loadBookmarkedSlugs();
  if (bookmarked) {
    slugs.add(slug);
  } else {
    slugs.delete(slug);
  }
  saveBookmarkedSlugs(slugs);
}

export function getReaderStatesForLibrary() {
  if (typeof window === "undefined") return new Map<string, ReaderState>();

  const states = new Map<string, ReaderState>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(READER_STATE_PREFIX)) continue;
    const state = readJson<ReaderState | null>(key, null);
    if (state?.slug) {
      states.set(state.slug, state);
    }
  }

  return states;
}
