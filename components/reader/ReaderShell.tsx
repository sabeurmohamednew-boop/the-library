"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
import { DEFAULT_READER_PREFERENCES } from "@/lib/config";
import { loadReaderState, saveReaderState, setBookBookmarked } from "@/lib/clientStorage";
import type { BookDTO, ReaderBookmark, ReaderLocator, ReaderState, SearchResult, TocItem } from "@/lib/types";
import { ShareButton } from "@/components/ShareButton";
import { ReaderErrorBoundary } from "@/components/reader/ReaderErrorBoundary";
import { ReaderLoadingFrame } from "@/components/reader/ReaderLoadingState";
import {
  READER_SHORTCUT_EVENT,
  type ReaderCommand,
  type ReaderCommandInput,
  type ReaderEngineProps,
  type ReaderLoadStatus,
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

type Panel = "toc" | "bookmarks" | "settings" | "search" | "menu" | null;

function createInitialState(slug: string): ReaderState {
  return {
    ...DEFAULT_READER_PREFERENCES,
    slug,
    progress: 0,
    pdfPage: 1,
    bookmarks: [],
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

export function ReaderShell({ book }: ReaderShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayTimer = useRef<number | null>(null);
  const wheelZoomFrame = useRef<number | null>(null);
  const pendingWheelZoom = useRef<number | null>(null);
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
  const [engineStatus, setEngineStatus] = useState<ReaderLoadStatus>({ phase: "idle", message: "Preparing reader" });
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [error, setError] = useState("");

  const fileUrl = `/api/books/${book.slug}/file`;
  const progressPercent = Math.round((state.progress || 0) * 100);
  const currentLocator = useMemo(() => currentLocatorFor(book, state), [book, state]);

  const handleLoadStatus = useCallback(
    (status: ReaderLoadStatus) => {
      setEngineStatus((current) => (current.phase === status.phase && current.message === status.message ? current : status));
      console.info("[reader-shell] load-status", { at: new Date().toISOString(), slug: book.slug, format: book.format, ...status });
    },
    [book.format, book.slug],
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

  const commandIdRef = useRef(0);
  const issueCommand = useCallback((nextCommand: ReaderCommandInput) => {
    commandIdRef.current += 1;
    setCommand({ ...nextCommand, id: commandIdRef.current });
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
    setEngineStatus({ phase: "idle", message: "Preparing reader" });
    const saved = loadReaderState(book.slug);
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
      storedCfi: cfiSnapshot(storedCfi),
      urlCfi: cfiSnapshot(params.get("cfi")),
      restoredCfi: cfiSnapshot(saved.epubCfi),
    });

    setState({
      ...createInitialState(book.slug),
      ...saved,
      lastOpenedAt: new Date().toISOString(),
    });
    setHydrated(true);
  }, [book.format, book.slug]);

  useEffect(() => {
    if (!hydrated) return;
    saveReaderState(book.slug, state);
  }, [book.slug, hydrated, state]);

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
  }, []);

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

      const normalizedKey = key.toLowerCase();
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
      if (key === "?") {
        setShortcutsOpen(true);
        return true;
      }

      return false;
    },
    [addBookmark, issueCommand, shortcutsOpen, toggleFullscreen],
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
    };
  }, []);

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
    <div ref={rootRef} className={`reader-page theme-${state.theme}`} style={{ "--reader-brightness": String(state.brightness / 100) } as React.CSSProperties}>
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
              placeholder="Search in book"
              aria-label="Search in book"
            />
          </div>

          <div className="reader-actions desktop-reader-actions">
            <button className="icon-button" type="button" onClick={() => issueCommand({ type: "prev" })} aria-label="Previous page or location">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => issueCommand({ type: "next" })} aria-label="Next page or location">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => setPanel(panel === "toc" ? null : "toc")} aria-label="Table of contents">
              <List size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={addBookmark} aria-label="Bookmark current location">
              <Bookmark size={18} aria-hidden="true" />
            </button>
            <ShareButton className="button" label="Share" getUrl={shareUrl} />
            <button className="icon-button" type="button" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Reader settings">
              <Settings size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
              <Maximize size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts">
              <HelpCircle size={18} aria-hidden="true" />
            </button>
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

      <div className="reader-progress-track" aria-label={`Reading progress ${progressPercent}%`}>
        <div className="reader-progress-fill" style={{ width: `${progressPercent}%` }} />
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
                command={command}
                searchQuery={searchQuery}
                onTocChange={setToc}
                onSearchResults={setSearchResults}
                onSearchStatus={setSearchStatus}
                onLocationChange={handleLocationChange}
                onError={setError}
                onLoadStatus={handleLoadStatus}
              />
            </ReaderErrorBoundary>
          )}
          <div className={overlayVisible ? "reader-overlay visible" : "reader-overlay"}>{state.locationLabel || `${progressPercent}%`}</div>
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
            state={state}
            updateState={updateState}
            close={() => setPanel(null)}
            goTo={(locator) => {
              issueCommand({ type: "goTo", locator });
              setPanel(null);
            }}
            removeBookmark={removeBookmark}
            openPanel={setPanel}
            addBookmark={addBookmark}
            toggleFullscreen={toggleFullscreen}
            shareUrl={shareUrl}
            bookFormat={book.format}
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
  state: ReaderState;
  updateState: (patch: Partial<ReaderState>) => void;
  close: () => void;
  goTo: (locator: ReaderLocator) => void;
  removeBookmark: (id: string) => void;
  openPanel: (panel: Panel) => void;
  addBookmark: () => void;
  toggleFullscreen: () => Promise<void>;
  shareUrl: () => string;
  bookFormat: BookDTO["format"];
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
      {panel === "bookmarks" ? <BookmarksPanel bookmarks={props.bookmarks} goTo={props.goTo} removeBookmark={props.removeBookmark} /> : null}
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
      {panel === "menu" ? (
        <MobileMenuPanel
          openPanel={props.openPanel}
          addBookmark={props.addBookmark}
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
    case "settings":
      return "Settings";
    case "search":
      return "Search";
    case "menu":
      return "Controls";
  }
}

function TocPanel({ toc, goTo }: { toc: TocItem[]; goTo: (locator: ReaderLocator) => void }) {
  if (toc.length === 0) {
    return <p className="muted">No table of contents is available for this book.</p>;
  }

  return (
    <div className="panel-list">
      {toc.map((item) => (
        <button key={item.id} className="button toc-button" type="button" onClick={() => goTo(item.locator)} style={{ paddingLeft: `${10 + (item.depth ?? 0) * 14}px` }}>
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
}: {
  bookmarks: ReaderBookmark[];
  goTo: (locator: ReaderLocator) => void;
  removeBookmark: (id: string) => void;
}) {
  if (bookmarks.length === 0) {
    return <p className="muted">No saved locations yet.</p>;
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
        Search words or phrase
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

      {inputQuery.length < 2 ? <p className="muted">Enter at least two characters.</p> : null}
      {waitingForPause ? <p className="muted">Pause typing or press Enter to search.</p> : null}
      {searching ? (
        <p className="muted search-status">
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
      {complete && activeResults.length === 0 ? <p className="muted">No matches found.</p> : null}
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
  const isPdf = bookFormat === "PDF";
  const dualPageAvailable = state.layout === "paginated" && largeReaderScreen;
  const dualPageReason = state.layout !== "paginated" ? "Dual page is available in horizontal reading mode." : "Dual page needs a wider screen.";

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
    <div className="settings-grid">
      <label className="label">
        Theme
        <select className="select" value={state.theme} onChange={(event) => updateState({ theme: event.target.value as ReaderState["theme"] })}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="sepia">Sepia</option>
        </select>
      </label>

      <label className="label">
        Layout
        <select
          className="select"
          value={state.layout}
          onChange={(event) => {
            const layout = event.target.value as ReaderState["layout"];
            updateState(layout === "vertical" ? { layout, dualPage: false } : { layout });
          }}
        >
          <option value="paginated">Horizontal pages</option>
          <option value="vertical">Vertical scroll</option>
        </select>
      </label>

      <label className="chip">
        <input type="checkbox" checked={state.fitWidth} onChange={(event) => updateState({ fitWidth: event.target.checked })} />
        Fit width
      </label>

      <label className={dualPageAvailable ? "chip" : "chip disabled"}>
        <input type="checkbox" checked={dualPageAvailable && state.dualPage} disabled={!dualPageAvailable} onChange={(event) => updateState({ dualPage: event.target.checked })} />
        Dual page on large screens
      </label>
      {!dualPageAvailable ? <p className="muted search-status">{dualPageReason}</p> : null}

      <label className="label">
        Zoom
        <span className="range-row">
          <input
            className="field"
            type="range"
            min="50"
            max="220"
            step="5"
            value={draftZoom}
            onChange={(event) => setDraftZoom(Number(event.target.value))}
            onPointerUp={(event) => commitZoom(Number(event.currentTarget.value))}
            onKeyUp={(event) => commitZoom(Number(event.currentTarget.value))}
          />
          <input
            className="field"
            type="number"
            min="50"
            max="220"
            value={draftZoom}
            onChange={(event) => setDraftZoom(Number(event.target.value))}
            onBlur={(event) => commitZoom(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitZoom(Number(event.currentTarget.value));
              }
            }}
            aria-label="Zoom percentage"
          />
        </span>
      </label>

      {!isPdf ? (
        <label className="label">
          Brightness
          <span className="range-row">
            <input className="field" type="range" min="70" max="120" step="5" value={state.brightness} onChange={(event) => updateState({ brightness: Number(event.target.value) })} />
            <span>{state.brightness}%</span>
          </span>
        </label>
      ) : null}

      {bookFormat === "EPUB" ? (
        <>
          <label className="label">
            Font
            <select className="select" value={state.fontFamily} onChange={(event) => updateState({ fontFamily: event.target.value as ReaderState["fontFamily"] })}>
              <option value="original">Original</option>
              <option value="default">None / default</option>
              <option value="literata">Literata</option>
              <option value="merriweather">Merriweather</option>
            </select>
          </label>

          <label className="label">
            Font size
            <span className="range-row">
              <input className="field" type="range" min="80" max="160" step="5" value={state.fontSize} onChange={(event) => updateState({ fontSize: Number(event.target.value) })} />
              <span>{state.fontSize}%</span>
            </span>
          </label>

          <label className="label">
            Line height
            <span className="range-row">
              <input className="field" type="range" min="1.2" max="2.1" step="0.05" value={state.lineHeight} onChange={(event) => updateState({ lineHeight: Number(event.target.value) })} />
              <span>{state.lineHeight.toFixed(2)}</span>
            </span>
          </label>

          <label className="label">
            Margins
            <span className="range-row">
              <input className="field" type="range" min="8" max="80" step="4" value={state.margin} onChange={(event) => updateState({ margin: Number(event.target.value) })} />
              <span>{state.margin}px</span>
            </span>
          </label>
        </>
      ) : (
        <p className="muted">PDF typography and page color stay original. Zoom, fit width, and theme background apply at the viewer level.</p>
      )}
    </div>
  );
}

function MobileMenuPanel({
  openPanel,
  addBookmark,
  toggleFullscreen,
  shareUrl,
}: {
  openPanel: (panel: Panel) => void;
  addBookmark: () => void;
  toggleFullscreen: () => Promise<void>;
  shareUrl: () => string;
}) {
  return (
    <div className="panel-list">
      <button className="button" type="button" onClick={() => openPanel("search")}>
        Search
      </button>
      <button className="button" type="button" onClick={() => openPanel("toc")}>
        Table of contents
      </button>
      <button className="button" type="button" onClick={addBookmark}>
        Bookmark current location
      </button>
      <button className="button" type="button" onClick={() => openPanel("bookmarks")}>
        Bookmarks
      </button>
      <button className="button" type="button" onClick={() => openPanel("settings")}>
        Settings
      </button>
      <ShareButton className="button" label="Share" getUrl={shareUrl} />
      <button className="button" type="button" onClick={toggleFullscreen}>
        Fullscreen
      </button>
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
          <kbd>T</kbd>
          <span>Table of contents</span>
          <kbd>B</kbd>
          <span>Bookmark current location</span>
          <kbd>F</kbd>
          <span>Fullscreen</span>
          <kbd>?</kbd>
          <span>Open shortcuts</span>
        </div>
      </div>
    </div>
  );
}
