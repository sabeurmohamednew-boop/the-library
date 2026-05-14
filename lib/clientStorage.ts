"use client";

import { DEFAULT_READER_PREFERENCES } from "@/lib/config";
import type { ReaderState } from "@/lib/types";
import {
  BOOKMARKED_BOOKS_KEY,
  READER_STATE_PREFIX,
  getReaderStatesForLibrary,
  loadBookmarkedSlugs,
  readJson,
  saveBookmarkedSlugs,
  writeJson,
} from "@/lib/libraryClientStorage";

export { BOOKMARKED_BOOKS_KEY, READER_STATE_PREFIX, getReaderStatesForLibrary, loadBookmarkedSlugs, saveBookmarkedSlugs };

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

export function setBookBookmarked(slug: string, bookmarked: boolean) {
  const slugs = loadBookmarkedSlugs();
  if (bookmarked) {
    slugs.add(slug);
  } else {
    slugs.delete(slug);
  }
  saveBookmarkedSlugs(slugs);
}
