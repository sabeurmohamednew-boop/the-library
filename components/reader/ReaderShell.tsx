"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  List,
  Maximize,
  Menu,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trackReaderOpened } from "@/lib/analytics";
import { DEFAULT_READER_PREFERENCES } from "@/lib/config";
import { loadReaderState, saveReaderState, setBookBookmarked } from "@/lib/clientStorage";
import { importReaderAnnotationsFromJson } from "@/lib/readerAnnotationImport";
import { dictionaryLookupForSelection, translationUrlForSelection } from "@/lib/readerStudyTools";
import { getClientTheme, readerThemeForGlobalTheme } from "@/lib/theme";
import type { BookDTO, ReaderAnnotation, ReaderBookmark, ReaderHighlightColor, ReaderLocator, ReaderProgressDisplay, ReaderState, SearchResult, TocItem } from "@/lib/types";
import { ShareButton } from "@/components/ShareButton";
import { ReaderErrorBoundary } from "@/components/reader/ReaderErrorBoundary";
import { ReaderLoadingFrame } from "@/components/reader/ReaderLoadingState";
import {
  READER_SHORTCUT_EVENT,
  type ReaderCommand,
  type ReaderCommandInput,
  type ReaderEngineProps,
  type ReaderLoadStatus,
  type ReaderReadableText,
  type ReaderSelection,
  type ReaderSearchStatus,
  type ReaderShortcutDetail,
} from "@/components/reader/types";

const PdfReader = dynamic<ReaderEngineProps>(() => import("@/components/reader/PdfReader").then((mod) => mod.PdfReader), {
  ssr: false,
  loading: () => <ReaderLoadingFrame detail="Loading PDF reader." />,
});

const EpubReader = dynamic<ReaderEngineProps>(() => import("@/components/reader/EpubReader").then((mod) => mod.EpubReader), {
  ssr: false,
  loading: () => <ReaderLoadingFrame detail="Loading EPUB reader." />,
});

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type ReaderShellProps = {
  book: BookDTO;
};

type Panel = "toc" | "bookmarks" | "annotations" | "settings" | "search" | "position" | "audio" | "info" | "menu" | null;
type SettingsTab = "text" | "lighting" | "layout" | "navigation";
type ImportStatus = { tone: "success" | "error"; message: string } | null;
type SpeechSupport = "checking" | "supported" | "unsupported";
type ReadAloudStatus = { tone: "info" | "error"; message: string } | null;
type SpeakTextOptions = {
  rate?: number;
  startPaused?: boolean;
  voiceId?: string;
};
type VoiceOption = {
  id: string;
  key: string;
  label: string;
  voice: SpeechSynthesisVoice;
};

function createInitialState(slug: string, theme: ReaderState["theme"] = DEFAULT_READER_PREFERENCES.theme): ReaderState {
  return {
    ...DEFAULT_READER_PREFERENCES,
    theme,
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

function currentLocatorFor(book: BookDTO, state: ReaderState): ReaderLocator | null {
  if (book.format === "PDF") {
    return { type: "pdf-page", page: state.pdfPage ?? 1 };
  }

  if (state.epubCfi) {
    return { type: "epub-cfi", cfi: state.epubCfi };
  }

  return null;
}

function locatorKey(locator: ReaderLocator) {
  if (locator.type === "pdf-page") return `pdf:${locator.page}`;
  if (locator.type === "epub-cfi") return `epub:${locator.cfi}`;
  return `epub-href:${locator.href}`;
}

function makeBookmarkId() {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeZoom(value: number) {
  if (!Number.isFinite(value)) return 100;
  return clampNumber(Math.round(value / 5) * 5, 50, 220);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;

  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest("[contenteditable='true'], [role='textbox']"))
  );
}

function shouldIgnoreShortcutEvent(event: KeyboardEvent) {
  return event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableShortcutTarget(event.target);
}

function cfiSnapshot(value: string | null | undefined) {
  const cfi = value?.trim() ?? "";
  return {
    present: Boolean(cfi),
    length: cfi.length,
    startsWithEpubCfi: cfi.startsWith("epubcfi("),
  };
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nextSessionStats(current: ReaderState["stats"]) {
  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const lastReadDate = current.lastReadDate;
  const alreadyReadToday = lastReadDate === today;
  const streak = alreadyReadToday ? current.streak : lastReadDate === yesterday ? current.streak + 1 : 1;

  return {
    ...current,
    sessions: current.sessions + 1,
    streak,
    lastReadDate: today,
  };
}

function cleanQuote(value: string, maxLength = 4000) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function progressLabel(progress: number) {
  return `${Math.round(clampNumber(progress, 0, 1) * 100)}%`;
}

function parsePageLabel(label?: string) {
  const match = label?.match(/page\s+(\d+)\s+of\s+(\d+)/i);
  if (!match) return null;

  return {
    page: Number(match[1]),
    total: Number(match[2]),
  };
}

function estimateMinutesFromPages(pages: number) {
  return Math.max(1, Math.round(Math.max(0, pages) * 1.8));
}

function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function formatReaderProgressDisplay(display: ReaderProgressDisplay, state: ReaderState, book: BookDTO, toc: TocItem[]) {
  if (display === "hidden") return "";
  if (display === "percentage") return progressLabel(state.progress || 0);

  const pageLabel = parsePageLabel(state.locationLabel);
  const currentPage = state.pdfPage ?? pageLabel?.page ?? Math.max(1, Math.round((state.progress || 0) * Math.max(1, book.pageCount)));
  const totalPages = pageLabel?.total || book.pageCount || undefined;

  if (display === "page") {
    return totalPages ? `Page ${currentPage} of ${totalPages}` : state.locationLabel || progressLabel(state.progress || 0);
  }

  if (display === "bookTimeLeft") {
    const remainingPages = totalPages ? Math.max(0, totalPages - currentPage) : Math.round((1 - (state.progress || 0)) * Math.max(1, book.pageCount || 180));
    return `About ${minutesLabel(estimateMinutesFromPages(remainingPages))} left`;
  }

  if (book.format !== "PDF" || !totalPages) {
    return display === "chapterPagesLeft" ? "Chapter pages unavailable" : "Chapter time unavailable";
  }

  const chapterPages = toc
    .flatMap((item) => (item.locator.type === "pdf-page" ? [item.locator.page] : []))
    .filter((page) => page > currentPage)
    .sort((first, second) => first - second);
  const nextChapterPage = chapterPages[0] ?? totalPages + 1;
  const pagesLeft = Math.max(0, nextChapterPage - currentPage - 1);

  if (display === "chapterPagesLeft") return `${pagesLeft} page${pagesLeft === 1 ? "" : "s"} left in chapter`;
  if (display === "chapterTimeLeft") return `About ${minutesLabel(estimateMinutesFromPages(pagesLeft))} left in chapter`;

  return progressLabel(state.progress || 0);
}

function highlightColorLabel(color: ReaderHighlightColor) {
  switch (color) {
    case "yellow":
      return "Yellow";
    case "green":
      return "Green";
    case "blue":
      return "Blue";
    case "pink":
      return "Pink";
  }
}

function voiceBaseId(voice: SpeechSynthesisVoice, index: number) {
  const uri = (voice.voiceURI ?? "").trim();
  if (uri) return uri;
  return [(voice.name ?? "").trim() || "voice", (voice.lang ?? "").trim() || "unknown", voice.localService ? "local" : "remote", voice.default ? "default" : "option", index].join("|");
}

function voiceLabel(voice: SpeechSynthesisVoice) {
  return `${voice.name || "Voice"}${voice.lang ? ` (${voice.lang})` : ""}`;
}

function createVoiceOptions(voices: SpeechSynthesisVoice[]): VoiceOption[] {
  const baseIds = voices.map(voiceBaseId);
  const counts = new Map<string, number>();
  baseIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));

  return voices.map((voice, index) => {
    const baseId = baseIds[index];
    const needsIndex = (counts.get(baseId) ?? 0) > 1;
    const id = needsIndex ? `${baseId}|${index}` : baseId;
    return {
      id,
      key: `${id}|${index}`,
      label: voiceLabel(voice),
      voice,
    };
  });
}

function resolveVoiceOption(voiceOptions: VoiceOption[], selectedId: string | undefined) {
  if (!voiceOptions.length) return null;
  if (!selectedId) return voiceOptions.find((option) => option.voice.default) ?? voiceOptions[0];

  return (
    voiceOptions.find((option) => option.id === selectedId) ??
    voiceOptions.find((option) => option.voice.voiceURI === selectedId) ??
    voiceOptions.find((option) => voiceBaseId(option.voice, voiceOptions.indexOf(option)) === selectedId) ??
    null
  );
}

export function ReaderShell({ book }: ReaderShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayTimer = useRef<number | null>(null);
  const wheelZoomFrame = useRef<number | null>(null);
  const pendingWheelZoom = useRef<number | null>(null);
  const readerOpenedTrackedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const controlsRevealTimer = useRef<number | null>(null);
  const controlsRevealedRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechSessionIdRef = useRef(0);
  const speechTextRef = useRef("");
  const speechWordIndexRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<ReaderState>(() => createInitialState(book.slug));
  const stateRef = useRef<ReaderState>(state);
  const [command, setCommand] = useState<ReaderCommand | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<ReaderSearchStatus>({ state: "idle", query: "" });
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [engineStatus, setEngineStatus] = useState<ReaderLoadStatus>({ phase: "idle", message: "Preparing reader" });
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [controlsRevealed, setControlsRevealed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [selectionUiMode, setSelectionUiMode] = useState<"desktop" | "mobile">("desktop");
  const [readableText, setReadableText] = useState<ReaderReadableText | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const voiceOptions = useMemo(() => createVoiceOptions(voices), [voices]);
  const selectedVoiceOption = useMemo(() => (state.readAloudVoiceURI ? resolveVoiceOption(voiceOptions, state.readAloudVoiceURI) : null), [state.readAloudVoiceURI, voiceOptions]);
  const selectedVoiceId = selectedVoiceOption?.id ?? "";
  const [speechSupport, setSpeechSupport] = useState<SpeechSupport>("checking");
  const [readAloudStatus, setReadAloudStatus] = useState<ReadAloudStatus>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);

  const fileUrl = `/api/books/${book.slug}/file`;
  const progressPercent = Math.round((state.progress || 0) * 100);
  const currentLocator = useMemo(() => currentLocatorFor(book, state), [book, state]);
  const progressDisplay = formatReaderProgressDisplay(state.progressDisplay, state, book, toc);
  const rootClassName = `reader-page theme-${state.theme} selection-ui-${selectionUiMode}${state.immersiveMode ? " immersive" : ""}${controlsRevealed ? " controls-revealed" : ""}${state.showControls ? "" : " controls-hidden"}`;

  const handleLoadStatus = useCallback(
    (status: ReaderLoadStatus) => {
      setEngineStatus((current) => (current.phase === status.phase && current.message === status.message ? current : status));
      if (status.phase === "ready" && !readerOpenedTrackedRef.current) {
        readerOpenedTrackedRef.current = true;
        trackReaderOpened(book);
      }
      console.info("[reader-shell] load-status", { at: new Date().toISOString(), slug: book.slug, format: book.format, ...status });
    },
    [book],
  );

  const updateState = useCallback((patch: Partial<ReaderState>) => {
    setState((current) => {
      const changed = Object.entries(patch).some(([key, value]) => current[key as keyof ReaderState] !== value);
      if (!changed) return current;

      return {
        ...current,
        ...patch,
        lastOpenedAt: new Date().toISOString(),
      };
    });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    controlsRevealedRef.current = controlsRevealed;
  }, [controlsRevealed]);

  useEffect(() => {
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const syncSelectionUiMode = () => {
      setSelectionUiMode(media.matches ? "mobile" : "desktop");
    };

    syncSelectionUiMode();
    media.addEventListener("change", syncSelectionUiMode);
    return () => media.removeEventListener("change", syncSelectionUiMode);
  }, []);

  const hideRevealedControls = useCallback(() => {
    if (controlsRevealTimer.current !== null) {
      window.clearTimeout(controlsRevealTimer.current);
      controlsRevealTimer.current = null;
    }
    setControlsRevealed(false);
  }, []);

  const revealImmersiveControls = useCallback(() => {
    if (selectionUiMode !== "mobile" || !stateRef.current.immersiveMode) return false;

    const wasRevealed = controlsRevealedRef.current;
    if (controlsRevealTimer.current !== null) {
      window.clearTimeout(controlsRevealTimer.current);
    }

    controlsRevealedRef.current = true;
    setControlsRevealed(true);
    controlsRevealTimer.current = window.setTimeout(() => {
      controlsRevealTimer.current = null;
      controlsRevealedRef.current = false;
      setControlsRevealed(false);
    }, 6500);

    return !wasRevealed;
  }, [selectionUiMode]);

  const commandIdRef = useRef(0);
  const issueCommand = useCallback((nextCommand: ReaderCommandInput) => {
    commandIdRef.current += 1;
    setCommand({ ...nextCommand, id: commandIdRef.current });
  }, []);

  const handleSelectionChange = useCallback((nextSelection: ReaderSelection | null) => {
    setSelection(nextSelection && cleanQuote(nextSelection.text).length >= 2 ? { ...nextSelection, text: cleanQuote(nextSelection.text) } : null);
  }, []);

  const handleReadableTextChange = useCallback((nextReadableText: ReaderReadableText | null) => {
    setReadableText(nextReadableText && cleanQuote(nextReadableText.text).length >= 2 ? { ...nextReadableText, text: cleanQuote(nextReadableText.text, 12000) } : null);
  }, []);

  const updateSearchInput = useCallback((value: string) => {
    setSearchInput(value);
    const query = value.trim();
    if (query) {
      setPanel("search");
    }

    if (query.length < 2) {
      setSearchQuery((current) => (current === "" ? current : ""));
      setSearchResults((current) => (current.length === 0 ? current : []));
      setSearchStatus((current) => (current.state === "idle" && current.query === query ? current : { state: "idle", query }));
    }
  }, []);

  const commitSearch = useCallback((value?: string) => {
    const query = (value ?? searchInput).trim();
    if (query.length < 2) {
      setSearchQuery((current) => (current === "" ? current : ""));
      setSearchResults((current) => (current.length === 0 ? current : []));
      setSearchStatus((current) => (current.state === "idle" && current.query === query ? current : { state: "idle", query }));
      return;
    }

    setPanel("search");
    setSearchStatus((current) => (current.query === query && current.state !== "idle" ? current : { state: "pending", query }));
    setSearchQuery((current) => (current === query ? current : query));
  }, [searchInput]);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await rootRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }, []);

  const addBookmark = useCallback(() => {
    if (!currentLocator) return;

    const key = locatorKey(currentLocator);
    const exists = state.bookmarks.some((item) => locatorKey(item.locator) === key);
    if (exists) {
      setPanel("bookmarks");
      return;
    }

    const bookmark: ReaderBookmark = {
      id: makeBookmarkId(),
      label: state.locationLabel || `${progressPercent}%`,
      createdAt: new Date().toISOString(),
      locator: currentLocator,
      progress: state.progress,
    };

    setBookBookmarked(book.slug, true);
    updateState({ bookmarks: [bookmark, ...state.bookmarks] });
    setPanel("bookmarks");
  }, [book.slug, currentLocator, progressPercent, state.bookmarks, state.locationLabel, state.progress, updateState]);

  const removeBookmark = useCallback(
    (id: string) => {
      updateState({ bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== id) });
    },
    [state.bookmarks, updateState],
  );

  const addAnnotation = useCallback(
    (kind: ReaderAnnotation["kind"], color: ReaderHighlightColor = "yellow", note = "") => {
      if (!selection) return;

      const annotation: ReaderAnnotation = {
        id: makeBookmarkId(),
        kind,
        quote: cleanQuote(selection.text),
        note: cleanQuote(note, 1200),
        color,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locator: selection.locator,
        progress: selection.progress,
        label: selection.label || progressLabel(selection.progress),
      };

      updateState({ annotations: [annotation, ...state.annotations] });
      setPanel("annotations");
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    },
    [selection, state.annotations, updateState],
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      updateState({ annotations: state.annotations.filter((annotation) => annotation.id !== id) });
    },
    [state.annotations, updateState],
  );

  const updateAnnotationNote = useCallback(
    (id: string, note: string) => {
      updateState({
        annotations: state.annotations.map((annotation) =>
          annotation.id === id ? { ...annotation, note: cleanQuote(note, 1200), updatedAt: new Date().toISOString(), kind: note.trim() ? "note" : annotation.kind } : annotation,
        ),
      });
    },
    [state.annotations, updateState],
  );

  const copySelectionQuote = useCallback(async () => {
    if (!selection) return;
    await navigator.clipboard?.writeText(selection.text).catch(() => undefined);
  }, [selection]);

  const openDictionary = useCallback(() => {
    if (!selection) return;
    const lookup = dictionaryLookupForSelection(selection.text);
    if (lookup) {
      window.open(lookup.url, "_blank", "noopener,noreferrer");
    }
  }, [selection]);

  const translateSelection = useCallback(() => {
    if (!selection) return;
    const url = translationUrlForSelection(selection.text);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [selection]);

  const exportReaderData = useCallback(() => {
    const payload = {
      book: {
        id: book.id,
        slug: book.slug,
        title: book.title,
        author: book.author,
        format: book.format,
      },
      exportedAt: new Date().toISOString(),
      progress: state.progress,
      bookmarks: state.bookmarks,
      annotations: state.annotations,
      stats: state.stats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${book.slug}-reader-notes.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [book, state.annotations, state.bookmarks, state.progress, state.stats]);

  const importReaderData = useCallback(
    async (file: File) => {
      const isJsonFile = file.name.toLowerCase().endsWith(".json") || file.type === "application/json";
      if (!isJsonFile) {
        setImportStatus({ tone: "error", message: "Choose a JSON reader export." });
        return;
      }

      let text = "";
      try {
        text = await file.text();
      } catch {
        setImportStatus({ tone: "error", message: "Could not read that file." });
        return;
      }

      const result = importReaderAnnotationsFromJson(text, {
        book,
        currentState: stateRef.current,
        makeId: makeBookmarkId,
      });

      if (!result.ok) {
        setImportStatus({ tone: "error", message: result.message });
        return;
      }

      if (result.counts.addedBookmarks > 0) {
        setBookBookmarked(book.slug, true);
      }

      updateState({
        annotations: result.annotations,
        bookmarks: result.bookmarks,
        progress: result.progress,
        ...(typeof result.pdfPage === "number" ? { pdfPage: result.pdfPage } : {}),
      });
      setImportStatus({ tone: "success", message: result.message });
    },
    [book, updateState],
  );

  const handleLocationChange = useCallback(
    (update: { locator: ReaderLocator; progress: number; label: string }) => {
      const patch: Partial<ReaderState> = {
        progress: update.progress,
        locationLabel: update.label,
      };

      if (update.locator.type === "pdf-page") {
        patch.pdfPage = update.locator.page;
      }

      if (update.locator.type === "epub-cfi") {
        patch.epubCfi = update.locator.cfi;
      }

      updateState(patch);

      const url = new URL(window.location.href);
      if (update.locator.type === "pdf-page") {
        url.searchParams.set("page", String(update.locator.page));
        url.searchParams.delete("cfi");
      } else if (update.locator.type === "epub-cfi") {
        url.searchParams.set("cfi", update.locator.cfi);
        url.searchParams.delete("page");
      }
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(null, "", url);
      }

      setOverlayVisible(true);
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      overlayTimer.current = window.setTimeout(() => setOverlayVisible(false), 2000);
    },
    [updateState],
  );

  useClientLayoutEffect(() => {
    readerOpenedTrackedRef.current = false;
    setEngineStatus({ phase: "idle", message: "Preparing reader" });
    const globalReaderTheme = readerThemeForGlobalTheme(getClientTheme());
    const defaultState = createInitialState(book.slug, globalReaderTheme);
    const saved = loadReaderState(book.slug, defaultState);
    const params = new URLSearchParams(window.location.search);
    const storedCfi = typeof saved.epubCfi === "string" ? saved.epubCfi.trim() : "";
    let restoreSource: "none" | "localStorage" | "url" = storedCfi ? "localStorage" : "none";

    if (book.format === "PDF") {
      const page = Number(params.get("page"));
      if (Number.isFinite(page) && page > 0) saved.pdfPage = page;
    } else {
      const cfi = params.get("cfi")?.trim() ?? "";
      if (cfi) {
        saved.epubCfi = cfi;
        restoreSource = "url";
      } else if (storedCfi) {
        saved.epubCfi = storedCfi;
      }
    }

    console.info("[reader-shell] restore-state", {
      at: new Date().toISOString(),
      slug: book.slug,
      format: book.format,
      restoreSource,
      globalReaderTheme,
      storedCfi: cfiSnapshot(storedCfi),
      urlCfi: cfiSnapshot(params.get("cfi")),
      restoredCfi: cfiSnapshot(saved.epubCfi),
    });

    setState({
      ...defaultState,
      ...saved,
      stats: nextSessionStats(saved.stats ?? defaultState.stats),
      lastOpenedAt: new Date().toISOString(),
    });
    setHydrated(true);
  }, [book.format, book.slug]);

  useEffect(() => {
    if (!hydrated) return;
    saveReaderState(book.slug, state);
  }, [book.slug, hydrated, state]);

  useEffect(() => {
    if (!hydrated) return undefined;

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      updateState({ stats: { ...stateRef.current.stats, minutesRead: stateRef.current.stats.minutesRead + 1, lastReadDate: todayKey() } });
    }, 60000);

    return () => window.clearInterval(timer);
  }, [hydrated, updateState]);

  useEffect(() => {
    const query = searchInput.trim();
    if (query.length < 2 || query === searchQuery) return;

    setSearchStatus((current) => (current.query === query && current.state === "pending" ? current : { state: "pending", query }));
    const timeout = window.setTimeout(() => {
      setSearchQuery((current) => (current === query ? current : query));
    }, 520);

    return () => window.clearTimeout(timeout);
  }, [searchInput, searchQuery]);

  useEffect(() => {
    setSearchInput("");
    setSearchQuery("");
    setSearchResults([]);
    setSearchStatus({ state: "idle", query: "" });
    setImportStatus(null);
  }, [book.slug]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    function handleChange() {
      if (media.matches && state.dualPage) {
        updateState({ dualPage: false });
      }
    }

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [state.dualPage, updateState]);

  useEffect(() => {
    if (!state.keepScreenAwake) return undefined;

    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          lock = await (navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        }
      } catch {
        lock = null;
      }
    }

    function handleVisibility() {
      if (!cancelled && document.visibilityState === "visible" && !lock) {
        void requestWakeLock();
      }
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, [state.keepScreenAwake]);

  useEffect(() => {
    if (state.orientation === "auto") return undefined;

    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
      unlock?: () => void;
    };
    if (typeof orientation?.lock !== "function") return undefined;

    const lock = state.orientation === "portrait" ? "portrait" : "landscape";
    void orientation.lock(lock).catch(() => undefined);

    return () => {
      orientation.unlock?.();
    };
  }, [state.orientation]);

  const handleReaderShortcut = useCallback(
    (key: string) => {
      if (shortcutsOpen) return false;

      if (key === "ArrowRight" || key === "PageDown") {
        issueCommand({ type: "next" });
        return true;
      }

      if (key === "ArrowLeft" || key === "PageUp") {
        issueCommand({ type: "prev" });
        return true;
      }

      if (state.volumeKeyPaging && (key === "AudioVolumeUp" || key === "VolumeUp")) {
        issueCommand({ type: "prev" });
        return true;
      }

      if (state.volumeKeyPaging && (key === "AudioVolumeDown" || key === "VolumeDown")) {
        issueCommand({ type: "next" });
        return true;
      }

      const normalizedKey = key.toLowerCase();
      if (normalizedKey === "n") {
        issueCommand({ type: "nextChapter" });
        return true;
      }
      if (normalizedKey === "p") {
        issueCommand({ type: "prevChapter" });
        return true;
      }
      if (normalizedKey === "t") {
        setPanel((current) => (current === "toc" ? null : "toc"));
        return true;
      }
      if (normalizedKey === "b") {
        addBookmark();
        return true;
      }
      if (normalizedKey === "f") {
        void toggleFullscreen();
        return true;
      }
      if (normalizedKey === "g") {
        setPanel((current) => (current === "position" ? null : "position"));
        return true;
      }
      if (key === "?") {
        setShortcutsOpen(true);
        return true;
      }

      return false;
    },
    [addBookmark, issueCommand, shortcutsOpen, state.volumeKeyPaging, toggleFullscreen],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreShortcutEvent(event)) return;
      if (handleReaderShortcut(event.key)) {
        event.preventDefault();
      }
    }

    function handleForwardedShortcut(event: Event) {
      const key = (event as CustomEvent<ReaderShortcutDetail>).detail?.key;
      if (key) {
        handleReaderShortcut(key);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(READER_SHORTCUT_EVENT, handleForwardedShortcut);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(READER_SHORTCUT_EVENT, handleForwardedShortcut);
    };
  }, [handleReaderShortcut]);

  useEffect(() => {
    return () => {
      if (overlayTimer.current) window.clearTimeout(overlayTimer.current);
      if (controlsRevealTimer.current) window.clearTimeout(controlsRevealTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!state.immersiveMode) {
      hideRevealedControls();
    }
  }, [hideRevealedControls, state.immersiveMode]);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (typing) return;

      event.preventDefault();
      const currentZoom = pendingWheelZoom.current ?? stateRef.current.zoom;
      const direction = event.deltaY < 0 ? 1 : -1;
      const magnitude = Math.min(4, Math.max(1, Math.round(Math.abs(event.deltaY) / 80)));
      const nextZoom = normalizeZoom(currentZoom + direction * magnitude * 5);
      if (nextZoom === currentZoom) return;

      pendingWheelZoom.current = nextZoom;
      if (wheelZoomFrame.current !== null) return;

      wheelZoomFrame.current = window.requestAnimationFrame(() => {
        const zoom = pendingWheelZoom.current;
        pendingWheelZoom.current = null;
        wheelZoomFrame.current = null;
        if (typeof zoom === "number") {
          updateState({ zoom });
        }
      });
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
      if (wheelZoomFrame.current !== null) {
        window.cancelAnimationFrame(wheelZoomFrame.current);
      }
    };
  }, [updateState]);

  useEffect(() => {
    const element = rootRef.current?.querySelector<HTMLElement>(".reader-stage");
    if (!element) return undefined;
    const stageElement = element;

    function isInteractiveTarget(target: EventTarget | null) {
      return target instanceof HTMLElement && Boolean(target.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']"));
    }

    function isEpubFrameTarget(target: EventTarget | null) {
      return target instanceof HTMLIFrameElement && Boolean(target.closest(".epub-stage"));
    }

    function handlePointerDown(event: PointerEvent) {
      if (isInteractiveTarget(event.target) || isEpubFrameTarget(event.target)) return;
      pointerStartRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    }

    function handlePointerUp(event: PointerEvent) {
      const start = pointerStartRef.current;
      pointerStartRef.current = null;
      if (!start || panel || isInteractiveTarget(event.target) || isEpubFrameTarget(event.target)) return;
      if (window.getSelection()?.toString().trim()) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const elapsed = Date.now() - start.time;
      const rect = stageElement.getBoundingClientRect();

      const isNarrowScreen = window.innerWidth <= 860;
      const swipeDistance = isNarrowScreen ? 42 : 56;
      const swipeRatio = isNarrowScreen ? 1.2 : 1.4;

      if (state.swipePaging && elapsed < 760 && Math.abs(dx) > swipeDistance && Math.abs(dx) > Math.abs(dy) * swipeRatio) {
        issueCommand({ type: dx < 0 ? "next" : "prev" });
        return;
      }

      const isShortTap = elapsed < 520 && Math.abs(dx) < 12 && Math.abs(dy) < 12;
      if (isShortTap && revealImmersiveControls()) return;

      if (state.tapZones && state.layout === "paginated" && isShortTap) {
        const x = event.clientX - rect.left;
        const edgeWidth = isNarrowScreen ? 0.28 : 0.24;
        if (x < rect.width * edgeWidth) issueCommand({ type: "prev" });
        if (x > rect.width * (1 - edgeWidth)) issueCommand({ type: "next" });
      }
    }

    stageElement.addEventListener("pointerdown", handlePointerDown);
    stageElement.addEventListener("pointerup", handlePointerUp);
    return () => {
      stageElement.removeEventListener("pointerdown", handlePointerDown);
      stageElement.removeEventListener("pointerup", handlePointerUp);
    };
  }, [issueCommand, panel, revealImmersiveControls, state.layout, state.swipePaging, state.tapZones]);

  useEffect(() => {
    const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    if (!supported) {
      setSpeechSupport("unsupported");
      setReadAloudStatus({ tone: "error", message: "Read aloud is not supported in this browser." });
      setVoices([]);
      return undefined;
    }

    setSpeechSupport("supported");

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    const timers = [window.setTimeout(loadVoices, 250), window.setTimeout(loadVoices, 1000)];
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!state.readAloudVoiceURI || !voiceOptions.length) return;
    if (resolveVoiceOption(voiceOptions, state.readAloudVoiceURI)) return;
    updateState({ readAloudVoiceURI: undefined });
    setReadAloudStatus({ tone: "info", message: "Selected voice is no longer available. Using the browser default." });
  }, [state.readAloudVoiceURI, updateState, voiceOptions]);

  const stopReadAloud = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    speechSessionIdRef.current += 1;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    speechTextRef.current = "";
    speechWordIndexRef.current = 0;
    setSpeaking(false);
    setSpeechPaused(false);
  }, []);

  const speakText = useCallback(
    (text: string, startWord = 0, options: SpeakTextOptions = {}) => {
      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        setReadAloudStatus({ tone: "error", message: "Read aloud is not supported in this browser." });
        return;
      }
      const cleanedText = cleanQuote(text, 20000);
      const words = cleanedText.split(/\s+/).filter(Boolean);
      const nextStartWord = Math.round(clampNumber(startWord, 0, words.length));
      const nextText = words.slice(nextStartWord).join(" ");
      const speech = window.speechSynthesis;
      const sessionId = speechSessionIdRef.current + 1;
      speechSessionIdRef.current = sessionId;

      speech.cancel();
      if (speech.paused) speech.resume();

      if (!nextText) {
        utteranceRef.current = null;
        speechTextRef.current = "";
        speechWordIndexRef.current = 0;
        setSpeaking(false);
        setSpeechPaused(false);
        setReadAloudStatus({ tone: "error", message: "There is no readable text here yet." });
        return;
      }

      const utterance = new SpeechSynthesisUtterance(nextText);
      const voiceOption = options.voiceId ? resolveVoiceOption(voiceOptions, options.voiceId) : selectedVoiceOption;
      if (voiceOption?.voice) utterance.voice = voiceOption.voice;
      utterance.rate = clampNumber(options.rate ?? state.readAloudRate, 0.5, 2);
      utterance.onstart = () => {
        if (speechSessionIdRef.current !== sessionId) return;
        setReadAloudStatus(null);
        setSpeaking(true);
        if (!options.startPaused) setSpeechPaused(false);
      };
      utterance.onboundary = (event) => {
        if (speechSessionIdRef.current !== sessionId) return;
        if (event.name !== "word") return;
        const spoken = nextText.slice(0, event.charIndex).trim().split(/\s+/).filter(Boolean).length;
        speechWordIndexRef.current = nextStartWord + spoken;
      };
      utterance.onend = () => {
        if (speechSessionIdRef.current !== sessionId) return;
        utteranceRef.current = null;
        speechTextRef.current = "";
        speechWordIndexRef.current = 0;
        setSpeaking(false);
        setSpeechPaused(false);
        if (state.readAloudAutoTurn) {
          issueCommand({ type: "next" });
        }
      };
      utterance.onerror = () => {
        if (speechSessionIdRef.current !== sessionId) return;
        utteranceRef.current = null;
        speechTextRef.current = "";
        speechWordIndexRef.current = 0;
        setSpeaking(false);
        setSpeechPaused(false);
        setReadAloudStatus({ tone: "error", message: "Read aloud could not start on this device." });
      };
      utteranceRef.current = utterance;
      speechTextRef.current = cleanedText;
      speechWordIndexRef.current = nextStartWord;
      setSpeaking(true);
      setSpeechPaused(Boolean(options.startPaused));
      speech.speak(utterance);
      if (options.startPaused) {
        speech.pause();
        window.setTimeout(() => {
          if (speechSessionIdRef.current === sessionId && utteranceRef.current === utterance && speech.speaking) {
            speech.pause();
            setSpeechPaused(true);
          }
        }, 0);
      }
    },
    [issueCommand, selectedVoiceOption, state.readAloudAutoTurn, state.readAloudRate, voiceOptions],
  );

  const toggleReadAloud = useCallback(() => {
    if (speechSupport === "unsupported" || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setReadAloudStatus({ tone: "error", message: "Read aloud is not supported in this browser." });
      return;
    }
    if (speaking && !speechPaused) {
      window.speechSynthesis.pause();
      setSpeechPaused(true);
      return;
    }
    if (speaking && speechPaused) {
      const currentText = speechTextRef.current || selection?.text || readableText?.text || "";
      const expectedRate = clampNumber(state.readAloudRate, 0.5, 2);
      const activeUtterance = utteranceRef.current;
      const rateMatches = Boolean(activeUtterance && Math.abs(activeUtterance.rate - expectedRate) < 0.001);
      const voiceMatches = selectedVoiceOption ? activeUtterance?.voice === selectedVoiceOption.voice : true;

      if (currentText && (!rateMatches || !voiceMatches)) {
        speakText(currentText, speechWordIndexRef.current);
        return;
      }

      window.speechSynthesis.resume();
      setSpeechPaused(false);
      return;
    }
    const text = selection?.text || readableText?.text || "";
    if (!text) {
      setReadAloudStatus({ tone: "error", message: "There is no readable text here yet." });
      return;
    }
    speakText(text);
  }, [readableText, selectedVoiceOption, selection, speakText, speaking, speechPaused, speechSupport, state.readAloudRate]);

  const changeReadAloudRate = useCallback(
    (rate: number) => {
      const nextRate = clampNumber(rate, 0.5, 2);
      updateState({ readAloudRate: nextRate });
      if (!speaking) return;

      const currentText = speechTextRef.current || selection?.text || readableText?.text || "";
      if (!currentText) return;

      speakText(currentText, speechWordIndexRef.current, { rate: nextRate, startPaused: speechPaused });
    },
    [readableText?.text, selection?.text, speaking, speechPaused, speakText, updateState],
  );

  const skipReadAloud = useCallback(
    (direction: -1 | 1) => {
      const text = speechTextRef.current || selection?.text || readableText?.text || "";
      if (!text) return;
      const wordsPerSecond = 3;
      const offset = Math.round(state.readAloudSkipSeconds * wordsPerSecond) * direction;
      speakText(text, Math.max(0, speechWordIndexRef.current + offset));
    },
    [readableText, selection, speakText, state.readAloudSkipSeconds],
  );

  useEffect(() => {
    if (!state.readAloudAutoStart || speaking || !readableText?.text) return;
    speakText(readableText.text);
  }, [readableText?.locator, readableText?.text, speakText, speaking, state.readAloudAutoStart]);

  useEffect(() => stopReadAloud, [stopReadAloud]);

  function shareUrl() {
    if (!currentLocator) return window.location.href;
    const url = new URL(window.location.href);
    if (currentLocator.type === "pdf-page") {
      url.searchParams.set("page", String(currentLocator.page));
      url.searchParams.delete("cfi");
    }
    if (currentLocator.type === "epub-cfi") {
      url.searchParams.set("cfi", currentLocator.cfi);
      url.searchParams.delete("page");
    }
    return url.toString();
  }

  const Engine = book.format === "PDF" ? PdfReader : EpubReader;

  return (
    <div ref={rootRef} className={rootClassName} style={{ "--reader-brightness": String(state.brightness / 100) } as CSSProperties}>
      <header className="reader-topbar">
        <div className="reader-title-row">
          <Link className="button subtle" href="/" aria-label="Back to The Library">
            <BookOpen size={18} aria-hidden="true" />
            The Library
          </Link>
        </div>

        <div className="reader-title" title={book.title}>
          {book.title}
        </div>

        <div className="reader-actions">
          <div className="search-wrap reader-search">
            <Search aria-hidden="true" />
            <input
              className="field"
              value={searchInput}
              onChange={(event) => {
                updateSearchInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSearch(event.currentTarget.value);
                }
              }}
              placeholder="Find in book"
              aria-label="Find in book"
            />
          </div>

          <div className="reader-actions desktop-reader-actions" aria-label="Reader shortcuts">
            <div className="reader-action-group" aria-label="Page controls">
              <button className="icon-button" type="button" onClick={() => issueCommand({ type: "prev" })} aria-label="Previous page or location">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button className="icon-button" type="button" onClick={() => issueCommand({ type: "next" })} aria-label="Next page or location">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="reader-action-group" aria-label="Book tools">
              <button className={panel === "toc" ? "icon-button active" : "icon-button"} type="button" onClick={() => setPanel(panel === "toc" ? null : "toc")} aria-label="Contents" aria-pressed={panel === "toc"}>
                <List size={18} aria-hidden="true" />
              </button>
              <button className="icon-button" type="button" onClick={addBookmark} aria-label="Add bookmark">
                <Bookmark size={18} aria-hidden="true" />
              </button>
              <button className={panel === "annotations" ? "button active" : "button"} type="button" onClick={() => setPanel(panel === "annotations" ? null : "annotations")} aria-pressed={panel === "annotations"}>
                Notes
              </button>
            </div>
            <div className="reader-action-group reader-action-group-utilities" aria-label="Reader tools">
              <button className={panel === "position" ? "button active" : "button"} type="button" onClick={() => setPanel(panel === "position" ? null : "position")} aria-pressed={panel === "position"}>
                Go
              </button>
              <button className={panel === "audio" ? "button active" : "button"} type="button" onClick={() => setPanel(panel === "audio" ? null : "audio")} aria-pressed={panel === "audio"}>
                Read
              </button>
              <ShareButton className="button reader-share-button" label="Share" getUrl={shareUrl} />
              <button className={panel === "settings" ? "icon-button active" : "icon-button"} type="button" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Settings" aria-pressed={panel === "settings"}>
                <Settings size={18} aria-hidden="true" />
              </button>
              <button className="icon-button" type="button" onClick={toggleFullscreen} aria-label="Fullscreen">
                <Maximize size={18} aria-hidden="true" />
              </button>
              <button className="icon-button" type="button" onClick={() => setShortcutsOpen(true)} aria-label="Shortcuts">
                <HelpCircle size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <button className="icon-button mobile-reader-menu" type="button" onClick={() => setPanel(panel === "menu" ? null : "menu")} aria-label="Reader controls">
            <Menu size={18} aria-hidden="true" />
          </button>

          <div className="mobile-reader-actions" aria-label="Page controls">
            <button className="icon-button" type="button" onClick={() => issueCommand({ type: "prev" })} aria-label="Previous page or location">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => issueCommand({ type: "next" })} aria-label="Next page or location">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className={state.progressDisplay === "hidden" ? "reader-progress-wrap hidden" : "reader-progress-wrap"}>
        {state.progressDisplay !== "hidden" ? (
          <>
          <div className="reader-progress-track" aria-label={`Reading progress ${progressPercent}%`}>
            <div className="reader-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {progressDisplay ? <div className="reader-progress-label">{progressDisplay}</div> : null}
          </>
        ) : null}
      </div>

      <main className={panel ? "reader-main panel-open" : "reader-main"} id="main">
        <section className="reader-stage" aria-label={`${book.format} reader${engineStatus.phase === "ready" ? "" : `, ${engineStatus.message}`}`}>
          {!hydrated ? (
            <ReaderLoadingFrame detail="Restoring your reading position." />
          ) : (
            <ReaderErrorBoundary downloadUrl={fileUrl} resetKey={`${book.slug}:${book.format}:${error}`}>
              <Engine
                book={book}
                fileUrl={fileUrl}
                state={state}
                annotations={state.annotations}
                command={command}
                searchQuery={searchQuery}
                onTocChange={setToc}
                onSearchResults={setSearchResults}
                onSearchStatus={setSearchStatus}
                onLocationChange={handleLocationChange}
                onSelectionChange={handleSelectionChange}
                onReadableTextChange={handleReadableTextChange}
                onReadingSurfaceTap={revealImmersiveControls}
                onError={setError}
                onLoadStatus={handleLoadStatus}
              />
            </ReaderErrorBoundary>
          )}
          <div className={overlayVisible ? "reader-overlay visible" : "reader-overlay"}>{state.locationLabel || `${progressPercent}%`}</div>
          {state.layout === "paginated" && !panel && !selection ? (
            <div className={overlayVisible ? "mobile-page-turn-controls visible" : "mobile-page-turn-controls"} aria-label="Page turn controls">
              <button className="icon-button" type="button" onClick={() => issueCommand({ type: "prev" })} aria-label="Previous page">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button className="icon-button" type="button" onClick={() => issueCommand({ type: "next" })} aria-label="Next page">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {selection ? (
            <>
              {selectionUiMode === "desktop" ? (
                <SelectionToolbar
                  selection={selection}
                  addAnnotation={addAnnotation}
                  copyQuote={copySelectionQuote}
                  openDictionary={openDictionary}
                  translateSelection={translateSelection}
                  clear={() => setSelection(null)}
                />
              ) : null}
              {selectionUiMode === "mobile" ? <MobileSelectionActions selection={selection} addAnnotation={addAnnotation} copyQuote={copySelectionQuote} clear={() => setSelection(null)} /> : null}
            </>
          ) : null}
        </section>

        {panel ? (
          <ReaderPanel
            panel={panel}
            toc={toc}
            searchInput={searchInput}
            committedSearchQuery={searchQuery}
            setSearchInput={updateSearchInput}
            commitSearch={commitSearch}
            searchResults={searchResults}
            searchStatus={searchStatus}
            bookmarks={state.bookmarks}
            annotations={state.annotations}
            state={state}
            updateState={updateState}
            close={() => setPanel(null)}
            goTo={(locator) => {
              console.info("[reader-shell] navigation:goTo", { at: new Date().toISOString(), slug: book.slug, locator });
              issueCommand({ type: "goTo", locator });
              setPanel(null);
            }}
            removeBookmark={removeBookmark}
            removeAnnotation={removeAnnotation}
            updateAnnotationNote={updateAnnotationNote}
            openPanel={setPanel}
            addBookmark={addBookmark}
            exportReaderData={exportReaderData}
            importReaderData={importReaderData}
            importStatus={importStatus}
            toggleFullscreen={toggleFullscreen}
            shareUrl={shareUrl}
            bookFormat={book.format}
            book={book}
            progressDisplay={progressDisplay}
            readableText={readableText}
            voiceOptions={voiceOptions}
            selectedVoiceId={selectedVoiceId}
            speechSupport={speechSupport}
            readAloudStatus={readAloudStatus}
            speaking={speaking}
            speechPaused={speechPaused}
            toggleReadAloud={toggleReadAloud}
            stopReadAloud={stopReadAloud}
            skipReadAloud={skipReadAloud}
            changeReadAloudRate={changeReadAloudRate}
            issueCommand={issueCommand}
          />
        ) : null}
      </main>

      {shortcutsOpen ? <ShortcutsModal close={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}

type ReaderPanelProps = {
  panel: Exclude<Panel, null>;
  toc: TocItem[];
  searchInput: string;
  committedSearchQuery: string;
  setSearchInput: (value: string) => void;
  commitSearch: (value?: string) => void;
  searchResults: SearchResult[];
  searchStatus: ReaderSearchStatus;
  bookmarks: ReaderBookmark[];
  annotations: ReaderAnnotation[];
  state: ReaderState;
  updateState: (patch: Partial<ReaderState>) => void;
  close: () => void;
  goTo: (locator: ReaderLocator) => void;
  removeBookmark: (id: string) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotationNote: (id: string, note: string) => void;
  openPanel: (panel: Panel) => void;
  addBookmark: () => void;
  exportReaderData: () => void;
  importReaderData: (file: File) => Promise<void>;
  importStatus: ImportStatus;
  toggleFullscreen: () => Promise<void>;
  shareUrl: () => string;
  bookFormat: BookDTO["format"];
  book: BookDTO;
  progressDisplay: string;
  readableText: ReaderReadableText | null;
  voiceOptions: VoiceOption[];
  selectedVoiceId: string;
  speechSupport: SpeechSupport;
  readAloudStatus: ReadAloudStatus;
  speaking: boolean;
  speechPaused: boolean;
  toggleReadAloud: () => void;
  stopReadAloud: () => void;
  skipReadAloud: (direction: -1 | 1) => void;
  changeReadAloudRate: (rate: number) => void;
  issueCommand: (command: ReaderCommandInput) => void;
};

function ReaderPanel(props: ReaderPanelProps) {
  const { panel, close } = props;
  const panelClassName = `reader-panel reader-panel-${panel}`;

  return (
    <aside className={panelClassName} aria-label="Reader panel">
      <div className="panel-head">
        <h2>{panelTitle(panel)}</h2>
        <button className="icon-button subtle" type="button" onClick={close} aria-label="Close panel">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {panel === "toc" ? <TocPanel toc={props.toc} goTo={props.goTo} /> : null}
      {panel === "bookmarks" ? <BookmarksPanel bookmarks={props.bookmarks} goTo={props.goTo} removeBookmark={props.removeBookmark} addBookmark={props.addBookmark} /> : null}
      {panel === "annotations" ? (
        <AnnotationsPanel
          annotations={props.annotations}
          goTo={props.goTo}
          removeAnnotation={props.removeAnnotation}
          updateAnnotationNote={props.updateAnnotationNote}
          exportReaderData={props.exportReaderData}
          importReaderData={props.importReaderData}
          importStatus={props.importStatus}
        />
      ) : null}
      {panel === "search" ? (
        <SearchPanel
          searchInput={props.searchInput}
          committedSearchQuery={props.committedSearchQuery}
          setSearchInput={props.setSearchInput}
          commitSearch={props.commitSearch}
          searchResults={props.searchResults}
          searchStatus={props.searchStatus}
          goTo={props.goTo}
        />
      ) : null}
      {panel === "settings" ? <SettingsPanel state={props.state} updateState={props.updateState} bookFormat={props.bookFormat} /> : null}
      {panel === "position" ? <PositionPanel state={props.state} book={props.book} progressDisplay={props.progressDisplay} issueCommand={props.issueCommand} /> : null}
      {panel === "audio" ? (
        <AudioPanel
          state={props.state}
          updateState={props.updateState}
          readableText={props.readableText}
          voiceOptions={props.voiceOptions}
          selectedVoiceId={props.selectedVoiceId}
          speechSupport={props.speechSupport}
          readAloudStatus={props.readAloudStatus}
          speaking={props.speaking}
          speechPaused={props.speechPaused}
          toggleReadAloud={props.toggleReadAloud}
          stopReadAloud={props.stopReadAloud}
          skipReadAloud={props.skipReadAloud}
          changeReadAloudRate={props.changeReadAloudRate}
        />
      ) : null}
      {panel === "info" ? (
        <BookInfoPanel
          book={props.book}
          state={props.state}
          exportReaderData={props.exportReaderData}
          importReaderData={props.importReaderData}
          importStatus={props.importStatus}
        />
      ) : null}
      {panel === "menu" ? (
        <MobileMenuPanel
          openPanel={props.openPanel}
          addBookmark={props.addBookmark}
          issueCommand={props.issueCommand}
          toggleFullscreen={props.toggleFullscreen}
          shareUrl={props.shareUrl}
        />
      ) : null}
    </aside>
  );
}

function panelTitle(panel: Exclude<Panel, null>) {
  switch (panel) {
    case "toc":
      return "Contents";
    case "bookmarks":
      return "Bookmarks";
    case "annotations":
      return "Notes and highlights";
    case "settings":
      return "Settings";
    case "search":
      return "Search";
    case "position":
      return "Go to";
    case "audio":
      return "Read aloud";
    case "info":
      return "Book";
    case "menu":
      return "Controls";
  }
}

function PanelEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="panel-empty-state">
      <span className="panel-empty-mark" aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="panel-empty-action">{action}</div> : null}
    </div>
  );
}

function TocPanel({ toc, goTo }: { toc: TocItem[]; goTo: (locator: ReaderLocator) => void }) {
  if (toc.length === 0) {
    return <PanelEmptyState title="No contents available" description="This book does not include a contents list. Search or page through to move around." />;
  }

  return (
    <div className="panel-list">
      {toc.map((item) => (
        <button
          key={item.id}
          className="button toc-button"
          type="button"
          onClick={() => {
            console.info("[reader-shell] toc:click", { at: new Date().toISOString(), label: item.label, locator: item.locator, depth: item.depth ?? 0 });
            goTo(item.locator);
          }}
          style={{ paddingLeft: `${10 + (item.depth ?? 0) * 14}px` }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function BookmarksPanel({
  bookmarks,
  goTo,
  removeBookmark,
  addBookmark,
}: {
  bookmarks: ReaderBookmark[];
  goTo: (locator: ReaderLocator) => void;
  removeBookmark: (id: string) => void;
  addBookmark: () => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <PanelEmptyState
        title="No bookmarks yet"
        description="Save your current place and come back to it later."
        action={
          <button className="button primary" type="button" onClick={addBookmark}>
            Add bookmark
          </button>
        }
      />
    );
  }

  return (
    <div className="panel-list">
      {bookmarks.map((bookmark) => (
        <div key={bookmark.id} className="list-item">
          <button className="button subtle" type="button" onClick={() => goTo(bookmark.locator)}>
            {bookmark.label}
          </button>
          <button className="button danger" type="button" onClick={() => removeBookmark(bookmark.id)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function SelectionToolbar({
  selection,
  addAnnotation,
  copyQuote,
  openDictionary,
  translateSelection,
  clear,
}: {
  selection: ReaderSelection;
  addAnnotation: (kind: ReaderAnnotation["kind"], color?: ReaderHighlightColor, note?: string) => void;
  copyQuote: () => Promise<void>;
  openDictionary: () => void;
  translateSelection: () => void;
  clear: () => void;
}) {
  const quotePreview = selection.text.length > 82 ? `${selection.text.slice(0, 82)}...` : selection.text;

  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Selected text tools">
      <p title={selection.text}>{quotePreview}</p>
      <div className="selection-toolbar-actions">
        {(["yellow", "green", "blue", "pink"] as ReaderHighlightColor[]).map((color) => (
          <button key={color} className={`highlight-swatch color-${color}`} type="button" onClick={() => addAnnotation("highlight", color)} aria-label={`Highlight ${highlightColorLabel(color)}`} />
        ))}
        <button className="button" type="button" onClick={() => {
          const note = window.prompt("Add a note to this passage", "");
          if (note !== null) addAnnotation("note", "yellow", note);
        }}>
          Note
        </button>
        <button className="button" type="button" onClick={() => void copyQuote()}>
          Copy
        </button>
        <button className="button" type="button" onClick={openDictionary}>
          Define
        </button>
        <button className="button" type="button" onClick={translateSelection}>
          Translate
        </button>
        <button className="icon-button subtle" type="button" onClick={clear} aria-label="Clear selection tools">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function MobileSelectionActions({
  selection,
  addAnnotation,
  copyQuote,
  clear,
}: {
  selection: ReaderSelection;
  addAnnotation: (kind: ReaderAnnotation["kind"], color?: ReaderHighlightColor, note?: string) => void;
  copyQuote: () => Promise<void>;
  clear: () => void;
}) {
  const quotePreview = selection.text.length > 96 ? `${selection.text.slice(0, 96)}...` : selection.text;

  return (
    <div className="mobile-selection-actions" role="toolbar" aria-label="Selected text actions">
      <p title={selection.text}>{quotePreview}</p>
      <div className="mobile-selection-row">
        {(["yellow", "green", "blue", "pink"] as ReaderHighlightColor[]).map((color) => (
          <button key={color} className={`highlight-swatch color-${color}`} type="button" onClick={() => addAnnotation("highlight", color)} aria-label={`Highlight ${highlightColorLabel(color)}`} />
        ))}
      </div>
      <div className="mobile-selection-row">
        <button className="button primary" type="button" onClick={() => {
          const note = window.prompt("Add a note to this passage", "");
          if (note !== null) addAnnotation("note", "yellow", note);
        }}>
          Note
        </button>
        <button className="button" type="button" onClick={() => void copyQuote()}>
          Copy
        </button>
        <button className="icon-button subtle" type="button" onClick={clear} aria-label="Close selected text actions">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function AnnotationTransferActions({
  exportReaderData,
  importReaderData,
  exportLabel = "Export all",
  importLabel = "Import",
}: {
  exportReaderData: () => void;
  importReaderData: (file: File) => Promise<void>;
  exportLabel?: string;
  importLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setIsImporting(true);
    try {
      await importReaderData(file);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="settings-actions-row annotation-transfer-actions">
      <button className="button" type="button" onClick={exportReaderData}>
        {exportLabel}
      </button>
      <button className="button" type="button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
        {isImporting ? "Importing" : importLabel}
      </button>
      <input ref={inputRef} hidden type="file" accept="application/json,.json" onChange={(event) => void handleImportFile(event)} />
    </div>
  );
}

function AnnotationsPanel({
  annotations,
  goTo,
  removeAnnotation,
  updateAnnotationNote,
  exportReaderData,
  importReaderData,
  importStatus,
}: {
  annotations: ReaderAnnotation[];
  goTo: (locator: ReaderLocator) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotationNote: (id: string, note: string) => void;
  exportReaderData: () => void;
  importReaderData: (file: File) => Promise<void>;
  importStatus: ImportStatus;
}) {
  if (annotations.length === 0) {
    return (
      <div className="settings-grid">
        <PanelEmptyState
          title="No notes or highlights yet"
          description="Select text to highlight, copy, define, translate, or add a note."
          action={<AnnotationTransferActions exportReaderData={exportReaderData} importReaderData={importReaderData} />}
        />
        {importStatus ? (
          <p className={importStatus.tone === "error" ? "panel-status-card import-status error" : "panel-status-card import-status"} role={importStatus.tone === "error" ? "alert" : "status"}>
            {importStatus.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="settings-grid">
      <AnnotationTransferActions exportReaderData={exportReaderData} importReaderData={importReaderData} />
      {importStatus ? (
        <p className={importStatus.tone === "error" ? "panel-status-card import-status error" : "panel-status-card import-status"} role={importStatus.tone === "error" ? "alert" : "status"}>
          {importStatus.message}
        </p>
      ) : null}
      <div className="panel-list annotation-list">
        {annotations.map((annotation) => (
          <article key={annotation.id} className={`annotation-item color-${annotation.color}`}>
            <div className="annotation-meta">
              <span>{annotation.kind === "note" ? "Note" : "Highlight"}</span>
              <span>{annotation.label}</span>
            </div>
            <blockquote>{annotation.quote}</blockquote>
            <label className="label">
              Note
              <textarea
                className="field annotation-note-field"
                defaultValue={annotation.note ?? ""}
                placeholder="Add a note"
                onBlur={(event) => updateAnnotationNote(annotation.id, event.currentTarget.value)}
              />
            </label>
            <div className="annotation-actions">
              <button className="button subtle" type="button" onClick={() => goTo(annotation.locator)}>
                Open passage
              </button>
              <button className="button danger" type="button" onClick={() => removeAnnotation(annotation.id)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PositionPanel({
  state,
  book,
  progressDisplay,
  issueCommand,
}: {
  state: ReaderState;
  book: BookDTO;
  progressDisplay: string;
  issueCommand: (command: ReaderCommandInput) => void;
}) {
  const [percent, setPercent] = useState(Math.round((state.progress || 0) * 100));
  const [page, setPage] = useState(state.pdfPage ?? 1);

  useEffect(() => {
    setPercent(Math.round((state.progress || 0) * 100));
    setPage(state.pdfPage ?? 1);
  }, [state.pdfPage, state.progress]);

  return (
    <div className="settings-grid">
      {progressDisplay ? <p className="panel-status-card">You are at {progressDisplay}</p> : null}
      <label className="label">
        Book position
        <span className="range-row">
          <input className="field" type="range" min="0" max="100" step="1" value={percent} onChange={(event) => setPercent(Number(event.target.value))} />
          <input className="field" type="number" min="0" max="100" value={percent} onChange={(event) => setPercent(Number(event.target.value))} aria-label="Book position" />
        </span>
      </label>
      <button className="button primary" type="button" onClick={() => issueCommand({ type: "goToProgress", progress: clampNumber(percent, 0, 100) / 100 })}>
        Go to {clampNumber(percent, 0, 100)}%
      </button>
      {book.format === "PDF" ? (
        <>
          <label className="label">
            PDF page
            <input className="field" type="number" min="1" max={book.pageCount || undefined} value={page} onChange={(event) => setPage(Number(event.target.value))} />
          </label>
          <button className="button" type="button" onClick={() => issueCommand({ type: "goTo", locator: { type: "pdf-page", page: Math.max(1, Math.round(page)) } })}>
            Open page
          </button>
        </>
      ) : (
        <p className="muted">EPUB positions are estimated. Saved locations, search, notes, and contents still open exact passages.</p>
      )}
    </div>
  );
}

function AudioPanel({
  state,
  updateState,
  readableText,
  voiceOptions,
  selectedVoiceId,
  speechSupport,
  readAloudStatus,
  speaking,
  speechPaused,
  toggleReadAloud,
  stopReadAloud,
  skipReadAloud,
  changeReadAloudRate,
}: {
  state: ReaderState;
  updateState: (patch: Partial<ReaderState>) => void;
  readableText: ReaderReadableText | null;
  voiceOptions: VoiceOption[];
  selectedVoiceId: string;
  speechSupport: SpeechSupport;
  readAloudStatus: ReadAloudStatus;
  speaking: boolean;
  speechPaused: boolean;
  toggleReadAloud: () => void;
  stopReadAloud: () => void;
  skipReadAloud: (direction: -1 | 1) => void;
  changeReadAloudRate: (rate: number) => void;
}) {
  return (
    <div className="settings-grid">
      <p className={readAloudStatus?.tone === "error" ? "panel-status-card error" : "panel-status-card"} role={readAloudStatus?.tone === "error" ? "alert" : "status"}>
        {readAloudStatus?.message ?? (readableText ? `Ready: ${readableText.label}` : "Readable text is not available here yet.")}
      </p>
      <div className="audio-controls">
        <button className="button primary" type="button" onClick={toggleReadAloud} disabled={speechSupport !== "supported" || !readableText}>
          {speaking ? (speechPaused ? "Resume" : "Pause") : "Read aloud"}
        </button>
        <button className="button" type="button" onClick={() => skipReadAloud(-1)} disabled={speechSupport !== "supported" || !speaking}>
          Back {state.readAloudSkipSeconds}s
        </button>
        <button className="button" type="button" onClick={() => skipReadAloud(1)} disabled={speechSupport !== "supported" || !speaking}>
          Forward {state.readAloudSkipSeconds}s
        </button>
        <button className="button danger" type="button" onClick={stopReadAloud} disabled={speechSupport !== "supported" || (!speaking && !speechPaused)}>
          Stop
        </button>
      </div>
      <label className="label">
        Voice
        <select className="select" value={selectedVoiceId} disabled={speechSupport !== "supported"} onChange={(event) => updateState({ readAloudVoiceURI: event.target.value || undefined })}>
          <option value="">Browser default</option>
          {voiceOptions.map((option) => (
            <option key={option.key} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Speed
        <span className="range-row">
          <input className="field" type="range" min="0.5" max="2" step="0.05" value={state.readAloudRate} disabled={speechSupport !== "supported"} onChange={(event) => changeReadAloudRate(Number(event.target.value))} />
          <span>{state.readAloudRate.toFixed(2)}x</span>
        </span>
      </label>
      <label className="label">
        Skip interval
        <select className="select" value={state.readAloudSkipSeconds} onChange={(event) => updateState({ readAloudSkipSeconds: Number(event.target.value) })}>
          <option value={10}>10 seconds</option>
          <option value={15}>15 seconds</option>
          <option value={30}>30 seconds</option>
        </select>
      </label>
      <label className="chip">
        <input type="checkbox" checked={state.readAloudAutoStart} onChange={(event) => updateState({ readAloudAutoStart: event.target.checked })} />
        Start automatically
      </label>
      <label className="chip">
        <input type="checkbox" checked={state.readAloudAutoTurn} onChange={(event) => updateState({ readAloudAutoTurn: event.target.checked })} />
        Turn pages automatically
      </label>
      <p className="muted">Uses the voices available on this device. Premium online voices are not configured.</p>
    </div>
  );
}

function BookInfoPanel({
  book,
  state,
  exportReaderData,
  importReaderData,
  importStatus,
}: {
  book: BookDTO;
  state: ReaderState;
  exportReaderData: () => void;
  importReaderData: (file: File) => Promise<void>;
  importStatus: ImportStatus;
}) {
  return (
    <div className="settings-grid">
      <div className="book-info-panel">
        <h3>{book.title}</h3>
        <p>{book.author}</p>
        <dl>
          <div>
            <dt>Format</dt>
            <dd>{book.format}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{book.pageCount || "Unknown"}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{progressLabel(state.progress || 0)}</dd>
          </div>
          <div>
            <dt>Minutes read</dt>
            <dd>{state.stats.minutesRead}</dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>{state.stats.sessions}</dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>{state.stats.streak} day{state.stats.streak === 1 ? "" : "s"}</dd>
          </div>
        </dl>
      </div>
      <div className="book-data-panel">
        <h3>Data</h3>
        <AnnotationTransferActions exportReaderData={exportReaderData} importReaderData={importReaderData} exportLabel="Export" importLabel="Import data" />
        {importStatus ? (
          <p className={importStatus.tone === "error" ? "panel-status-card import-status error" : "panel-status-card import-status"} role={importStatus.tone === "error" ? "alert" : "status"}>
            {importStatus.message}
          </p>
        ) : null}
      </div>
      <p className="muted">Similar books and sync need catalog and account support. This reader only shows available app data.</p>
    </div>
  );
}

function SearchPanel({
  searchInput,
  committedSearchQuery,
  setSearchInput,
  commitSearch,
  searchResults,
  searchStatus,
  goTo,
}: {
  searchInput: string;
  committedSearchQuery: string;
  setSearchInput: (value: string) => void;
  commitSearch: (value?: string) => void;
  searchResults: SearchResult[];
  searchStatus: ReaderSearchStatus;
  goTo: (locator: ReaderLocator) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(40);
  const inputQuery = searchInput.trim();
  const statusMatchesInput = searchStatus.query === inputQuery;
  const committedMatchesInput = committedSearchQuery === inputQuery;
  const waitingForPause = inputQuery.length >= 2 && !committedMatchesInput;
  const searching = inputQuery.length >= 2 && statusMatchesInput && (searchStatus.state === "pending" || searchStatus.state === "searching");
  const complete = inputQuery.length >= 2 && committedMatchesInput && statusMatchesInput && searchStatus.state === "done";
  const activeResults = committedMatchesInput ? searchResults : [];
  const visibleResults = activeResults.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(40);
  }, [inputQuery]);

  return (
    <div className="settings-grid">
      <label className="label">
        Find in book
        <input
          className="field"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitSearch(event.currentTarget.value);
            }
          }}
        />
      </label>

      {inputQuery.length < 2 ? <PanelEmptyState title="Search inside this book" description="Enter at least two characters to find a word or phrase." /> : null}
      {waitingForPause ? <div className="panel-status-card">Press Enter or pause to search.</div> : null}
      {searching ? (
        <p className="panel-status-card search-status">
          Searching
          {searchStatus.totalPages ? ` page ${searchStatus.searchedPages ?? 0} of ${searchStatus.totalPages}` : ""}
          {typeof searchStatus.resultCount === "number" ? ` / ${searchStatus.resultCount} result${searchStatus.resultCount === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}

      <div className="panel-list">
        {visibleResults.map((result) => (
          <button key={result.id} className="button search-result-button" type="button" onClick={() => goTo(result.locator)}>
            <span>
              {result.label}
              {result.excerpt ? <span className="muted"> / {result.excerpt}</span> : null}
            </span>
          </button>
        ))}
      </div>
      {activeResults.length > visibleCount ? (
        <button className="button subtle" type="button" onClick={() => setVisibleCount((count) => count + 40)}>
          Show more results
        </button>
      ) : null}
      {complete && activeResults.length > 0 ? (
        <p className="muted search-status">
          {searchStatus.truncated ? `Showing first ${activeResults.length} matches.` : `${activeResults.length} match${activeResults.length === 1 ? "" : "es"} found.`}
        </p>
      ) : null}
      {complete && activeResults.length === 0 ? <PanelEmptyState title="No matches found" description="Try a shorter phrase, a different spelling, or a broader word." /> : null}
    </div>
  );
}

function SettingsPanel({
  state,
  updateState,
  bookFormat,
}: {
  state: ReaderState;
  updateState: (patch: Partial<ReaderState>) => void;
  bookFormat: BookDTO["format"];
}) {
  const [draftZoom, setDraftZoom] = useState(state.zoom);
  const [largeReaderScreen, setLargeReaderScreen] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>("text");
  const isPdf = bookFormat === "PDF";
  const dualPageAvailable = state.layout === "paginated" && largeReaderScreen;
  const dualPageReason = state.layout !== "paginated" ? "Dual page is available in horizontal reading mode." : "Dual page needs a wider screen.";
  const customTypographyDisabled = isPdf || state.originalFormatting;

  useEffect(() => {
    setDraftZoom(state.zoom);
  }, [state.zoom]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const handleChange = () => setLargeReaderScreen(media.matches);

    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!dualPageAvailable && state.dualPage) {
      updateState({ dualPage: false });
    }
  }, [dualPageAvailable, state.dualPage, updateState]);

  useEffect(() => {
    const nextZoom = normalizeZoom(draftZoom);
    if (nextZoom === state.zoom) return undefined;

    const timeout = window.setTimeout(() => {
      updateState({ zoom: nextZoom });
    }, 160);

    return () => window.clearTimeout(timeout);
  }, [draftZoom, state.zoom, updateState]);

  const commitZoom = useCallback(
    (value: number) => {
      const nextZoom = normalizeZoom(value);
      setDraftZoom(nextZoom);
      updateState({ zoom: nextZoom });
    },
    [updateState],
  );

  return (
    <div className="settings-panel">
      <div className="settings-tabs" role="tablist" aria-label="Reader settings sections">
        {(["text", "lighting", "layout", "navigation"] as SettingsTab[]).map((tab) => (
          <button key={tab} className={activeTab === tab ? "segmented-button active" : "segmented-button"} type="button" onClick={() => setActiveTab(tab)} role="tab" aria-selected={activeTab === tab}>
            {tab === "text" ? "Text" : tab === "lighting" ? "Lighting" : tab === "layout" ? "Layout" : "Navigation"}
          </button>
        ))}
      </div>

      {activeTab === "text" ? (
        <div className="settings-grid">
          {isPdf ? <p className="panel-status-card">PDF typography stays faithful to the source. Zoom, fit width, theme, and navigation controls still apply.</p> : null}

          <label className="chip">
            <input type="checkbox" checked={state.originalFormatting} disabled={isPdf} onChange={(event) => updateState({ originalFormatting: event.target.checked })} />
            Preserve publisher formatting
          </label>

          <label className="chip">
            <input type="checkbox" checked={state.normalizeText} disabled={customTypographyDisabled} onChange={(event) => updateState({ normalizeText: event.target.checked })} />
            Clean up inconsistent formatting
          </label>

          <label className="label">
            Font
            <select className="select" value={state.fontFamily} disabled={customTypographyDisabled} onChange={(event) => updateState({ fontFamily: event.target.value as ReaderState["fontFamily"] })}>
              <option value="original">Original</option>
              <option value="default">Serif</option>
              <option value="system">Sans</option>
              <option value="literata">Literata</option>
              <option value="merriweather">Merriweather</option>
            </select>
          </label>

          <label className="label">
            Font size
            <span className="range-row">
              <input className="field" type="range" min="80" max="180" step="5" value={state.fontSize} disabled={customTypographyDisabled} onChange={(event) => updateState({ fontSize: Number(event.target.value) })} />
              <span>{state.fontSize}%</span>
            </span>
          </label>

          <label className="label">
            Line height
            <span className="range-row">
              <input className="field" type="range" min="1.2" max="2.2" step="0.05" value={state.lineHeight} disabled={customTypographyDisabled} onChange={(event) => updateState({ lineHeight: Number(event.target.value) })} />
              <span>{state.lineHeight.toFixed(2)}</span>
            </span>
          </label>

          <label className="label">
            Alignment
            <select className="select" value={state.textAlign} disabled={customTypographyDisabled} onChange={(event) => updateState({ textAlign: event.target.value as ReaderState["textAlign"] })}>
              <option value="left">Left</option>
              <option value="justify">Justified</option>
            </select>
          </label>

          <label className="label">
            Paragraph spacing
            <span className="range-row">
              <input className="field" type="range" min="0" max="2" step="0.05" value={state.paragraphSpacing} disabled={customTypographyDisabled} onChange={(event) => updateState({ paragraphSpacing: Number(event.target.value) })} />
              <span>{state.paragraphSpacing.toFixed(2)}em</span>
            </span>
          </label>

          <label className="label">
            Word spacing
            <span className="range-row">
              <input className="field" type="range" min="0" max="8" step="0.5" value={state.wordSpacing} disabled={customTypographyDisabled} onChange={(event) => updateState({ wordSpacing: Number(event.target.value) })} />
              <span>{state.wordSpacing}px</span>
            </span>
          </label>

          <label className="label">
            Letter spacing
            <span className="range-row">
              <input className="field" type="range" min="0" max="2" step="0.1" value={state.letterSpacing} disabled={customTypographyDisabled} onChange={(event) => updateState({ letterSpacing: Number(event.target.value) })} />
              <span>{state.letterSpacing.toFixed(1)}px</span>
            </span>
          </label>
        </div>
      ) : null}

      {activeTab === "lighting" ? (
        <div className="settings-grid">
          <label className="label">
            Theme
            <select className="select" value={state.theme} onChange={(event) => updateState({ theme: event.target.value as ReaderState["theme"] })}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="sepia">Sepia</option>
              <option value="black">Pure black</option>
            </select>
          </label>

          <label className="label">
            Brightness
            <span className="range-row">
              <input className="field" type="range" min="55" max="125" step="5" value={state.brightness} onChange={(event) => updateState({ brightness: Number(event.target.value) })} />
              <span>{state.brightness}%</span>
            </span>
          </label>

          <label className="chip">
            <input type="checkbox" checked={state.immersiveMode} onChange={(event) => updateState({ immersiveMode: event.target.checked })} />
            Immersive mode
          </label>
          <label className="chip">
            <input type="checkbox" checked={state.showControls} onChange={(event) => updateState({ showControls: event.target.checked })} />
            Show controls
          </label>
          <label className="chip">
            <input type="checkbox" checked={state.keepScreenAwake} onChange={(event) => updateState({ keepScreenAwake: event.target.checked })} />
            Keep screen awake
          </label>
          <p className="muted">Status bar and orientation controls depend on browser support and work best in fullscreen.</p>
        </div>
      ) : null}

      {activeTab === "layout" ? (
        <div className="settings-grid">
          <label className="label">
            Flow
            <select
              className="select"
              value={state.layout}
              onChange={(event) => {
                const layout = event.target.value as ReaderState["layout"];
                updateState(layout === "vertical" ? { layout, dualPage: false } : { layout });
              }}
            >
              <option value="paginated">Pages</option>
              <option value="vertical">Scroll</option>
            </select>
          </label>

          <label className="chip">
            <input type="checkbox" checked={state.fitWidth} onChange={(event) => updateState({ fitWidth: event.target.checked })} />
            Fit width
          </label>

          <label className={dualPageAvailable ? "chip" : "chip disabled"}>
            <input type="checkbox" checked={dualPageAvailable && state.dualPage} disabled={!dualPageAvailable} onChange={(event) => updateState({ dualPage: event.target.checked })} />
            Two pages on wide screens
          </label>
          {!dualPageAvailable ? <p className="muted search-status">{dualPageReason}</p> : null}

          <label className="label">
            Zoom
            <span className="range-row">
              <input className="field" type="range" min="50" max="220" step="5" value={draftZoom} onChange={(event) => setDraftZoom(Number(event.target.value))} onPointerUp={(event) => commitZoom(Number(event.currentTarget.value))} onKeyUp={(event) => commitZoom(Number(event.currentTarget.value))} />
              <input className="field" type="number" min="50" max="220" value={draftZoom} onChange={(event) => setDraftZoom(Number(event.target.value))} onBlur={(event) => commitZoom(Number(event.currentTarget.value))} onKeyDown={(event) => {
                if (event.key === "Enter") commitZoom(Number(event.currentTarget.value));
              }} aria-label="Zoom percentage" />
            </span>
          </label>

          <label className="label">
            Margins
            <span className="range-row">
              <input className="field" type="range" min="8" max="96" step="4" value={state.margin} disabled={isPdf} onChange={(event) => updateState({ margin: Number(event.target.value) })} />
              <span>{state.margin}px</span>
            </span>
          </label>

          <label className="label">
            Orientation
            <select className="select" value={state.orientation} onChange={(event) => updateState({ orientation: event.target.value as ReaderState["orientation"] })}>
              <option value="auto">Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>

          <label className="label">
            Page turn
            <select className="select" value={state.pageTurnAnimation} onChange={(event) => updateState({ pageTurnAnimation: event.target.value as ReaderState["pageTurnAnimation"] })}>
              <option value="none">None</option>
              <option value="slide">Slide</option>
              <option value="flip">Page flip</option>
            </select>
          </label>
        </div>
      ) : null}

      {activeTab === "navigation" ? (
        <div className="settings-grid">
          <label className="label">
            Progress
            <select className="select" value={state.progressDisplay} onChange={(event) => updateState({ progressDisplay: event.target.value as ReaderState["progressDisplay"] })}>
              <option value="percentage">Percent</option>
              <option value="page">Page</option>
              <option value="chapterPagesLeft">Chapter pages left</option>
              <option value="chapterTimeLeft">Chapter time left</option>
              <option value="bookTimeLeft">Book time left</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>
          <div className="settings-actions-row">
            <button className="button" type="button" onClick={() => issueReaderShortcut("prevChapter")}>
              Previous chapter
            </button>
            <button className="button" type="button" onClick={() => issueReaderShortcut("nextChapter")}>
              Next chapter
            </button>
          </div>
          <label className="chip">
            <input type="checkbox" checked={state.tapZones} onChange={(event) => updateState({ tapZones: event.target.checked })} />
            Tap edges to turn pages
          </label>
          <label className="chip">
            <input type="checkbox" checked={state.swipePaging} onChange={(event) => updateState({ swipePaging: event.target.checked })} />
            Swipe to turn pages
          </label>
          <label className="chip">
            <input type="checkbox" checked={state.volumeKeyPaging} onChange={(event) => updateState({ volumeKeyPaging: event.target.checked })} />
            Use volume keys to turn pages
          </label>
          <p className="muted">Volume key support depends on the browser and device.</p>
        </div>
      ) : null}
    </div>
  );

  function issueReaderShortcut(type: "prevChapter" | "nextChapter") {
    window.dispatchEvent(new CustomEvent<ReaderShortcutDetail>(READER_SHORTCUT_EVENT, { detail: { key: type === "nextChapter" ? "n" : "p" } }));
  }
}

function MobileMenuPanel({
  openPanel,
  addBookmark,
  issueCommand,
  toggleFullscreen,
  shareUrl,
}: {
  openPanel: (panel: Panel) => void;
  addBookmark: () => void;
  issueCommand: (command: ReaderCommandInput) => void;
  toggleFullscreen: () => Promise<void>;
  shareUrl: () => string;
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="mobile-menu-content">
      <div className="panel-list mobile-menu-primary">
        <button className="button" type="button" onClick={() => openPanel("search")}>
          Search
        </button>
        <button className="button" type="button" onClick={() => openPanel("toc")}>
          Contents
        </button>
        <button className="button" type="button" onClick={() => openPanel("annotations")}>
          Notes and highlights
        </button>
        <button className="button" type="button" onClick={addBookmark}>
          Add bookmark
        </button>
        <button className="button" type="button" onClick={() => openPanel("bookmarks")}>
          Bookmarks
        </button>
        <button className="button" type="button" onClick={() => openPanel("settings")}>
          Settings
        </button>
        <button className="button subtle" type="button" onClick={() => setShowMore((current) => !current)} aria-expanded={showMore}>
          More
        </button>
      </div>

      {showMore ? (
        <div className="panel-list mobile-menu-secondary" aria-label="More reader controls">
          <button className="button" type="button" onClick={() => openPanel("position")}>
            Go to
          </button>
          <button className="button" type="button" onClick={() => openPanel("audio")}>
            Read aloud
          </button>
          <button className="button" type="button" onClick={() => openPanel("info")}>
            Book
          </button>
          <div className="settings-actions-row">
            <button className="button" type="button" onClick={() => issueCommand({ type: "prevChapter" })}>
              Previous chapter
            </button>
            <button className="button" type="button" onClick={() => issueCommand({ type: "nextChapter" })}>
              Next chapter
            </button>
          </div>
          <ShareButton className="button" label="Share" getUrl={shareUrl} />
          <button className="button" type="button" onClick={toggleFullscreen}>
            Fullscreen
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ShortcutsModal({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="modal">
        <div className="panel-head">
          <h2 id="shortcuts-title">Shortcuts</h2>
          <button className="icon-button subtle" type="button" onClick={close} aria-label="Close shortcuts">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="shortcuts-grid">
          <kbd>Right</kbd>
          <span>Next page or location</span>
          <kbd>Left</kbd>
          <span>Previous page or location</span>
          <kbd>N</kbd>
          <span>Next chapter</span>
          <kbd>P</kbd>
          <span>Previous chapter</span>
          <kbd>T</kbd>
          <span>Contents</span>
          <kbd>B</kbd>
          <span>Add bookmark</span>
          <kbd>G</kbd>
          <span>Go to</span>
          <kbd>F</kbd>
          <span>Fullscreen</span>
          <kbd>?</kbd>
          <span>Open shortcuts</span>
        </div>
      </div>
    </div>
  );
}
