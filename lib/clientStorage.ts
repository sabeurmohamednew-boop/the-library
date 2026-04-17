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

export function loadReaderState(slug: string): ReaderState {
  return readJson<ReaderState>(readerStateKey(slug), {
    ...DEFAULT_READER_PREFERENCES,
    slug,
    progress: 0,
    bookmarks: [],
    lastOpenedAt: new Date().toISOString(),
  });
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
