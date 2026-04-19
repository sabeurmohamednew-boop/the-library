import type { ReaderAnnotation, ReaderBookDTO, ReaderLocator, ReaderState, SearchResult, TocItem } from "@/lib/types";

export const READER_SHORTCUT_EVENT = "library-reader-shortcut";

export type ReaderShortcutDetail = {
  key: string;
};

export type ReaderCommand =
  | { id: number; type: "next" | "prev" | "nextChapter" | "prevChapter" }
  | { id: number; type: "goTo"; locator: ReaderLocator }
  | { id: number; type: "goToProgress"; progress: number };

export type ReaderCommandInput =
  | { type: "next" | "prev" | "nextChapter" | "prevChapter" }
  | { type: "goTo"; locator: ReaderLocator }
  | { type: "goToProgress"; progress: number };

export type ReaderSelection = {
  text: string;
  locator: ReaderLocator;
  progress: number;
  label: string;
};

export type ReaderReadableText = {
  text: string;
  locator: ReaderLocator;
  label: string;
};

export type ReaderSearchStatus = {
  state: "idle" | "pending" | "searching" | "done";
  query: string;
  searchedPages?: number;
  totalPages?: number;
  resultCount?: number;
  truncated?: boolean;
};

export type ReaderLoadStatus = {
  phase: "idle" | "fetching" | "parsing" | "rendering" | "retrying" | "ready" | "error";
  message: string;
};

export type ReaderEngineProps = {
  book: ReaderBookDTO;
  fileUrl: string;
  state: ReaderState;
  annotations: ReaderAnnotation[];
  command: ReaderCommand | null;
  searchQuery: string;
  onTocChange: (items: TocItem[]) => void;
  onSearchResults: (items: SearchResult[]) => void;
  onSearchStatus: (status: ReaderSearchStatus) => void;
  onLocationChange: (update: { locator: ReaderLocator; progress: number; label: string }) => void;
  onSelectionChange: (selection: ReaderSelection | null) => void;
  onReadableTextChange: (text: ReaderReadableText | null) => void;
  onReadingSurfaceTap?: () => boolean;
  onError: (message: string) => void;
  onLoadStatus: (status: ReaderLoadStatus) => void;
};
