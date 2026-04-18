"use client";

import posthog from "posthog-js";
import type { BookDTO } from "@/lib/types";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();

let initialized = false;

type AnalyticsBook = Pick<BookDTO, "slug" | "title" | "format">;
type BookEventProperties = {
  book_slug: string;
  book_title: string;
  format: BookDTO["format"];
  progress?: number;
};

export function isPostHogConfigured() {
  return Boolean(posthogKey && posthogHost);
}

export function initPostHog() {
  if (typeof window === "undefined" || !posthogKey || !posthogHost) {
    return null;
  }

  if (!initialized && !posthog.__loaded) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: "2026-01-30",
      capture_pageview: "history_change",
      autocapture: true,
    });
    initialized = true;
  }

  return posthog;
}

function bookProperties(book: AnalyticsBook): BookEventProperties {
  return {
    book_slug: book.slug,
    book_title: book.title,
    format: book.format,
  };
}

function captureBookEvent(event: "read_click" | "download_click" | "reader_opened", book: AnalyticsBook) {
  if (!initPostHog()) return;

  posthog.capture(event, bookProperties(book));
}

export function trackReadClick(book: AnalyticsBook) {
  captureBookEvent("read_click", book);
}

export function trackDownloadClick(book: AnalyticsBook) {
  captureBookEvent("download_click", book);
}

export function trackResumeClick(book: AnalyticsBook, progress?: number) {
  if (!initPostHog()) return;

  posthog.capture("resume_click", {
    ...bookProperties(book),
    ...(typeof progress === "number" && Number.isFinite(progress) ? { progress } : {}),
  });
}

export function trackReaderOpened(book: AnalyticsBook) {
  captureBookEvent("reader_opened", book);
}
