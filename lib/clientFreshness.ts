"use client";

export const LIBRARY_CONTENT_VERSION_KEY = "library:content-version";

export function markLibraryContentChanged(version = Date.now().toString()) {
  try {
    window.localStorage.setItem(LIBRARY_CONTENT_VERSION_KEY, version);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}
