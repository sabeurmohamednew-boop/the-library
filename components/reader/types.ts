import type { BookDTO, ReaderLocator, ReaderState, SearchResult, TocItem } from "@/lib/types";

export const READER_SHORTCUT_EVENT = "library-reader-shortcut";

export type ReaderShortcutDetail = {
  key: string;
};

export type ReaderCommand =
  | { id: number; type: "next" | "prev" }
  | { id: number; type: "goTo"; locator: ReaderLocator };

export type ReaderCommandInput =
  | { type: "next" | "prev" }
  | { type: "goTo"; locator: ReaderLocator };

export type ReaderSearchStatus = {
  state: "idle" | "pending" | "searching" | "done";
  query: string;
  searchedPages?: number;
  totalPages?: number;
  resultCount?: number;
  truncated?: boolean;
};

export type ReaderLoadStatus = {
  phase: "idle" | "fetching" | "parsing" | "rendering" | "ready" | "error";
  message: string;
};

export type ReaderEngineProps = {
  book: BookDTO;
  fileUrl: string;
  state: ReaderState;
  command: ReaderCommand | null;
  searchQuery: string;
  onTocChange: (items: TocItem[]) => void;
  onSearchResults: (items: SearchResult[]) => void;
  onSearchStatus: (status: ReaderSearchStatus) => void;
  onLocationChange: (update: { locator: ReaderLocator; progress: number; label: string }) => void;
  onError: (message: string) => void;
  onLoadStatus: (status: ReaderLoadStatus) => void;
};
