"use client";

import ePub from "epubjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReaderFailure } from "@/components/reader/ReaderFailure";
import { READER_SHORTCUT_EVENT, type ReaderEngineProps, type ReaderShortcutDetail } from "@/components/reader/types";
import type { ReaderState, SearchResult, TocItem } from "@/lib/types";

type EpubSettings = Pick<
  ReaderState,
  "theme" | "layout" | "zoom" | "fitWidth" | "dualPage" | "brightness" | "fontFamily" | "fontSize" | "lineHeight" | "margin"
>;

function flattenToc(items: any[] = [], depth = 0): TocItem[] {
  const output: TocItem[] = [];

  for (const item of items) {
    if (item.href) {
      output.push({
        id: `${item.href}-${item.label || item.title || depth}`,
        label: item.label || item.title || "Section",
        locator: { type: "epub-href", href: item.href },
        depth,
      });
    }
    output.push(...flattenToc(item.subitems || item.items || [], depth + 1));
  }

  return output;
}

function themeColors(theme: ReaderState["theme"]) {
  if (theme === "dark") {
    return { background: "#171916", color: "#f1f2ee", heading: "#fafbf7", link: "#8fcfbd", selection: "rgba(143, 207, 189, 0.32)" };
  }

  if (theme === "sepia") {
    return { background: "#f4ead4", color: "#2d261b", heading: "#211b13", link: "#4f6f62", selection: "rgba(143, 104, 44, 0.26)" };
  }

  return { background: "#ffffff", color: "#1f211f", heading: "#171917", link: "#2f6f60", selection: "rgba(47, 111, 96, 0.22)" };
}

function fontFamilyFor(setting: ReaderState["fontFamily"]) {
  if (setting === "original") return "";
  if (setting === "literata") return "Literata, Georgia, serif";
  if (setting === "merriweather") return "Merriweather, Cambria, Georgia, serif";
  if (setting === "default") return "ui-serif, Georgia, serif";
  return "";
}

function safeCall(callback: () => void) {
  try {
    callback();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[epub-reader] ignored rendition call", error);
    }
  }
}

function readerDebugEnabled() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("library:debug-reader") === "1";
  } catch {
    return false;
  }
}

function devLog(message: string, data?: Record<string, unknown>) {
  if (readerDebugEnabled()) {
    console.info(`[epub-reader] ${message}`, data ?? "");
  }
}

function devError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[epub-reader] ${message}`, error);
  }
}

function headerValue(response: Response, name: string) {
  return response.headers.get(name) ?? "";
}

function isForwardableReaderShortcut(key: string) {
  if (key === "ArrowRight" || key === "PageDown" || key === "ArrowLeft" || key === "PageUp" || key === "?") {
    return true;
  }

  const normalized = key.toLowerCase();
  return normalized === "t" || normalized === "b" || normalized === "f";
}

function editableElementFromTarget(target: EventTarget | null) {
  const node = target as Node | null;
  if (!node || typeof node !== "object" || !("nodeType" in node)) return null;
  if (node.nodeType === 1) return node as Element;
  return node.parentElement;
}

function isEditableContentTarget(target: EventTarget | null) {
  const element = editableElementFromTarget(target);
  if (!element) return false;

  const tagName = element.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    Boolean((element as HTMLElement).isContentEditable) ||
    Boolean(element.closest("[contenteditable='true'], [role='textbox']"))
  );
}

function bindContentKeyboardShortcuts(
  content: any,
  boundDocuments: { current: WeakSet<Document> },
  cleanups: { current: Array<() => void> },
) {
  const documentElement = content?.document as Document | undefined;
  if (!documentElement || boundDocuments.current.has(documentElement)) return;

  boundDocuments.current.add(documentElement);
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!isForwardableReaderShortcut(event.key) || isEditableContentTarget(event.target)) return;

    event.preventDefault();
    window.dispatchEvent(new CustomEvent<ReaderShortcutDetail>(READER_SHORTCUT_EVENT, { detail: { key: event.key } }));
  };

  documentElement.addEventListener("keydown", handleKeyDown);
  cleanups.current.push(() => documentElement.removeEventListener("keydown", handleKeyDown));
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 20000) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function getElementSize(element: HTMLElement | null) {
  if (!element) return { width: 0, height: 0 };
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(320, Math.floor(rect.width || element.clientWidth || 0)),
    height: Math.max(320, Math.floor(rect.height || element.clientHeight || 0)),
  };
}

function buildContentCss(settings: EpubSettings) {
  const colors = themeColors(settings.theme);
  const fontFamily = fontFamilyFor(settings.fontFamily);
  const fontRule = fontFamily ? `font-family: ${fontFamily} !important;` : "";
  const horizontalMargin = Math.max(8, settings.margin);
  const verticalMargin = Math.max(8, Math.round(settings.margin * 0.45));

  return `
    :root {
      color-scheme: ${settings.theme === "dark" ? "dark" : "light"};
      background: ${colors.background} !important;
    }

    html,
    body {
      min-height: 100% !important;
      background: ${colors.background} !important;
    }

    body {
      color: ${colors.color} !important;
      ${fontRule}
      font-size: ${settings.fontSize}% !important;
      line-height: ${settings.lineHeight} !important;
      margin: 0 !important;
      padding: ${verticalMargin}px ${horizontalMargin}px !important;
      box-sizing: border-box !important;
    }

    body p,
    body li,
    body blockquote,
    body dd,
    body dt {
      line-height: ${settings.lineHeight} !important;
    }

    body,
    body p,
    body li,
    body blockquote,
    body div,
    body section,
    body article,
    body main,
    body span,
    body em,
    body i,
    body b,
    body strong {
      color: ${colors.color} !important;
      ${fontRule}
    }

    body h1,
    body h2,
    body h3,
    body h4,
    body h5,
    body h6 {
      color: ${colors.heading} !important;
      ${fontRule}
      line-height: 1.25 !important;
    }

    body a,
    body a * {
      color: ${colors.link} !important;
    }

    body ::selection {
      background: ${colors.selection} !important;
    }
  `;
}

function applyContentStyles(rendition: any, settings: EpubSettings) {
  const contents = typeof rendition?.getContents === "function" ? rendition.getContents() : [];

  contents.forEach((content: any) => {
    applyContentStyleToContent(content, settings);
  });
}

function applyContentStyleToContent(content: any, settings: EpubSettings) {
  const css = buildContentCss(settings);
  const colors = themeColors(settings.theme);
  const fontFamily = fontFamilyFor(settings.fontFamily);
  const horizontalMargin = Math.max(8, settings.margin);
  const verticalMargin = Math.max(8, Math.round(settings.margin * 0.45));

  safeCall(() => content?.addStylesheetCss?.(css, "library-reader-settings"));
  safeCall(() => content?.css?.("background-color", colors.background, true));
  safeCall(() => content?.css?.("color", colors.color, true));
  safeCall(() => content?.css?.("font-size", `${settings.fontSize}%`, true));
  safeCall(() => content?.css?.("line-height", String(settings.lineHeight), true));
  safeCall(() => content?.css?.("margin", "0", true));
  safeCall(() => content?.css?.("padding", `${verticalMargin}px ${horizontalMargin}px`, true));
  safeCall(() => content?.css?.("box-sizing", "border-box", true));
  safeCall(() => {
    if (fontFamily) {
      content?.css?.("font-family", fontFamily, true);
    } else {
      content?.css?.("font-family");
    }
  });
}

function resizeRenditionToElement(rendition: any, element: HTMLElement | null) {
  if (!rendition?.manager || typeof rendition.resize !== "function") return;
  const { width, height } = getElementSize(element);
  if (width <= 0 || height <= 0) return;
  rendition.resize(width, height);
}

function applySettings(rendition: any, settings: EpubSettings, options: { resize?: boolean; container?: HTMLElement | null } = {}) {
  if (!rendition?.themes) return;

  const shouldResize = options.resize ?? true;
  const colors = themeColors(settings.theme);
  const fontFamily = fontFamilyFor(settings.fontFamily);

  safeCall(() => {
    rendition.themes.register("library", {
      body: {
        background: `${colors.background} !important`,
        color: `${colors.color} !important`,
        "line-height": `${settings.lineHeight} !important`,
        margin: `0 ${settings.margin}px !important`,
        padding: "0 !important",
      },
      "p, li, blockquote": {
        "font-size": `${settings.fontSize}% !important`,
      },
      a: {
        color: `${colors.link} !important`,
      },
      "::selection": {
        background: "rgba(47, 111, 96, 0.22)",
      },
    });
    rendition.themes.select("library");
    rendition.themes.fontSize(`${settings.fontSize}%`);
    rendition.themes.override("line-height", String(settings.lineHeight), true);
    if (fontFamily) {
      rendition.themes.font(fontFamily);
    } else {
      rendition.themes.removeOverride?.("font-family");
    }
  });

  safeCall(() => {
    if (typeof rendition.flow === "function") {
      rendition.flow(settings.layout === "vertical" ? "scrolled-doc" : "paginated");
    }
  });

  safeCall(() => {
    if (typeof rendition.spread === "function") {
      rendition.spread(settings.layout === "paginated" && settings.dualPage ? "always" : "none");
    }
  });

  applyContentStyles(rendition, settings);

  if (shouldResize) {
    window.requestAnimationFrame(() => {
      safeCall(() => {
        resizeRenditionToElement(rendition, options.container ?? null);
        applyContentStyles(rendition, settings);
        window.setTimeout(() => applyContentStyles(rendition, settings), 80);
      });
    });
  }
}

function resultExcerpt(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}

async function displayLocator(rendition: any, book: any, locator: SearchResult["locator"]) {
  if (locator.type === "epub-cfi") {
    await rendition.display?.(locator.cfi);
    return;
  }

  if (locator.type === "epub-href") {
    const href = locator.href;
    const hrefWithoutHash = href.split("#")[0];
    const section =
      book?.spine?.get?.(href) ??
      book?.spine?.get?.(hrefWithoutHash) ??
      book?.spine?.get?.(decodeURIComponent(href)) ??
      book?.spine?.get?.(decodeURIComponent(hrefWithoutHash));

    if (section?.index !== undefined) {
      const sectionStart = section.cfiBase ? `epubcfi(${section.cfiBase}!/4/2/2/1:0)` : section.href;
      devLog("display:href", { href, index: section.index, sectionHref: section.href, target: sectionStart });
      if (rendition.manager?.display) {
        await rendition.manager.display(section, sectionStart);
        rendition.reportLocation?.();
      } else {
        await rendition.display?.(sectionStart);
      }
      return;
    }

    devLog("display:href", { href, fallback: true });
    await rendition.display?.(href);
  }
}

export function EpubReader({
  fileUrl,
  state,
  command,
  searchQuery,
  onTocChange,
  onSearchResults,
  onSearchStatus,
  onLocationChange,
  onError,
}: ReaderEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const destroyedRef = useRef(false);
  const handledCommand = useRef(0);
  const lastCfi = useRef("");
  const initialCfi = useRef(state.epubCfi);
  const contentKeyboardDocumentsRef = useRef<WeakSet<Document>>(new WeakSet());
  const contentKeyboardCleanupsRef = useRef<Array<() => void>>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const settings = useMemo<EpubSettings>(
    () => ({
      theme: state.theme,
      layout: state.layout,
      zoom: state.zoom,
      fitWidth: state.fitWidth,
      dualPage: state.dualPage,
      brightness: state.brightness,
      fontFamily: state.fontFamily,
      fontSize: state.fontSize,
      lineHeight: state.lineHeight,
      margin: state.margin,
    }),
    [state.brightness, state.dualPage, state.fitWidth, state.fontFamily, state.fontSize, state.layout, state.lineHeight, state.margin, state.theme, state.zoom],
  );
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let cancelled = false;
    destroyedRef.current = false;
    setReady(false);
    setLoadError("");
    onError("");
    onTocChange([]);
    onSearchResults([]);
    onSearchStatus({ state: "idle", query: "" });
    element.replaceChildren();
    contentKeyboardCleanupsRef.current.forEach((cleanup) => cleanup());
    contentKeyboardCleanupsRef.current = [];
    contentKeyboardDocumentsRef.current = new WeakSet();

    async function loadBook() {
      let book: any = null;
      let rendition: any = null;
      let removeRelocatedListener: (() => void) | undefined;

      try {
        devLog("fetch:start", { url: fileUrl });
        const response = await fetch(fileUrl);
        if (cancelled || destroyedRef.current) return undefined;
        devLog("fetch:response", {
          url: response.url,
          status: response.status,
          ok: response.ok,
          contentType: headerValue(response, "content-type"),
          contentLength: headerValue(response, "content-length"),
          acceptRanges: headerValue(response, "accept-ranges"),
        });

        if (!response.ok) {
          throw new Error(`EPUB request failed with status ${response.status}.`);
        }

        const buffer = await response.arrayBuffer();
        if (cancelled || destroyedRef.current) return undefined;
        devLog("fetch:buffer", { byteLength: buffer.byteLength });

        if (buffer.byteLength <= 0) {
          throw new Error("EPUB response was empty.");
        }

        const contentType = headerValue(response, "content-type").toLowerCase();
        if (contentType.includes("text/html")) {
          throw new Error("EPUB request returned HTML instead of an EPUB file.");
        }

        devLog("epub:init", { byteLength: buffer.byteLength });
        book = ePub(buffer);
        if (cancelled || destroyedRef.current) {
          safeCall(() => book?.destroy?.());
          return undefined;
        }
        bookRef.current = book;

        book.ready?.catch((error: unknown) => {
          devError("book.ready rejected", error);
        });

        devLog("rendition:renderTo:start");
        const initialSize = getElementSize(element);
        rendition = book.renderTo(element, {
          width: initialSize.width,
          height: initialSize.height,
          flow: settingsRef.current.layout === "vertical" ? "scrolled-doc" : "paginated",
          spread: settingsRef.current.layout === "paginated" && settingsRef.current.dualPage ? "always" : "none",
          manager: "default",
        });
        if (cancelled || destroyedRef.current) {
          safeCall(() => rendition?.destroy?.());
          safeCall(() => book?.destroy?.());
          return undefined;
        }
        renditionRef.current = rendition;
        devLog("rendition:renderTo:done");

        const handleRelocated = (location: any) => {
          if (cancelled || destroyedRef.current) return;
          const cfi = location?.start?.cfi;
          if (!cfi || cfi === lastCfi.current) return;
          lastCfi.current = cfi;

          let progress = 0;
          try {
            progress = book.locations?.percentageFromCfi(cfi) ?? 0;
          } catch {
            progress = 0;
          }

          const displayed = location?.start?.displayed;
          const label = displayed?.page && displayed?.total ? `Location ${displayed.page} of ${displayed.total}` : `${Math.round(progress * 100)}%`;

          onLocationChange({
            locator: { type: "epub-cfi", cfi },
            progress,
            label,
          });
        };

        const applyCurrentContentStyles = () => {
          const run = () => {
            if (!cancelled && !destroyedRef.current) {
              applyContentStyles(rendition, settingsRef.current);
            }
          };
          window.requestAnimationFrame(run);
          window.setTimeout(run, 80);
        };
        const handleRendered = (_section: unknown) => {
          devLog("rendition:rendered");
          applyCurrentContentStyles();
        };
        const handleDisplayed = (_section: unknown) => {
          devLog("rendition:displayed");
          applyCurrentContentStyles();
        };
        const handleLayout = (_layout: unknown) => {
          devLog("rendition:layout");
          applyCurrentContentStyles();
        };
        const handleRendering = (_section: unknown) => {
          devLog("rendition:rendering");
        };

        rendition.on?.("relocated", handleRelocated);
        rendition.on?.("rendered", handleRendered);
        rendition.on?.("displayed", handleDisplayed);
        rendition.on?.("rendering", handleRendering);
        rendition.on?.("layout", handleLayout);
        removeRelocatedListener = () => {
          rendition.off?.("relocated", handleRelocated);
          rendition.off?.("rendered", handleRendered);
          rendition.off?.("displayed", handleDisplayed);
          rendition.off?.("rendering", handleRendering);
          rendition.off?.("layout", handleLayout);
        };
        rendition.on?.("error", (error: unknown) => {
          devError("rendition error", error);
        });
        rendition.hooks?.content?.register?.((contents: any) => {
          applyContentStyleToContent(contents, settingsRef.current);
          bindContentKeyboardShortcuts(contents, contentKeyboardDocumentsRef, contentKeyboardCleanupsRef);
        });

        applySettings(rendition, settingsRef.current, { resize: false, container: element });

        devLog("book.ready:start");
        await withTimeout(book.ready, "book.ready");
        if (cancelled || destroyedRef.current) return;
        devLog("book.ready:done");

        const navigation = await book.loaded.navigation.catch((error: unknown) => {
          devError("navigation load failed", error);
          return null;
        });
        if (!cancelled && !destroyedRef.current) {
          onTocChange(flattenToc(navigation?.toc ?? []));
        }

        devLog("rendition.display:start", { target: initialCfi.current || "start" });
        await withTimeout(Promise.resolve(rendition.display(initialCfi.current || undefined)), "rendition.display");
        if (cancelled || destroyedRef.current) return;
        devLog("rendition.display:done");
        const activeContents = typeof rendition.getContents === "function" ? rendition.getContents() : [];
        activeContents.forEach((content: any) => bindContentKeyboardShortcuts(content, contentKeyboardDocumentsRef, contentKeyboardCleanupsRef));

        setReady(true);
        window.requestAnimationFrame(() => {
          if (!cancelled && !destroyedRef.current) {
            applySettings(rendition, settingsRef.current, { container: element });
          }
        });

        void book.locations.generate(1000).then(
          () => devLog("locations.generate:done"),
          (error: unknown) => devError("locations.generate failed", error),
        );

        return removeRelocatedListener;
      } catch (error) {
        if (cancelled || destroyedRef.current) return undefined;
        const message = "This EPUB could not be loaded. The file may be missing, blocked, or invalid.";
        setLoadError(message);
        onError(message);
        devError("load failed", error);
        safeCall(() => rendition?.destroy?.());
        safeCall(() => book?.destroy?.());
        return undefined;
      }
    }

    let removeListeners: (() => void) | undefined;
    void loadBook().then((cleanup) => {
      removeListeners = cleanup;
    });

    return () => {
      cancelled = true;
      destroyedRef.current = true;
      removeListeners?.();
      contentKeyboardCleanupsRef.current.forEach((cleanup) => cleanup());
      contentKeyboardCleanupsRef.current = [];
      contentKeyboardDocumentsRef.current = new WeakSet();
      safeCall(() => renditionRef.current?.destroy?.());
      safeCall(() => bookRef.current?.destroy?.());
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [fileUrl, onError, onLocationChange, onSearchResults, onSearchStatus, onTocChange, retryKey]);

  useEffect(() => {
    if (!ready || destroyedRef.current) return;
    const rendition = renditionRef.current;
    if (!rendition) return;
    applySettings(rendition, settings, { container: containerRef.current });
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) return undefined;
    const element = containerRef.current;
    if (!element) return undefined;

    let frame: number | null = null;
    const scheduleResize = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const rendition = renditionRef.current;
        if (!rendition || destroyedRef.current) return;
        safeCall(() => {
          resizeRenditionToElement(rendition, element);
          applyContentStyles(rendition, settingsRef.current);
        });
      });
    };

    const observer = new ResizeObserver(scheduleResize);
    observer.observe(element);
    scheduleResize();

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || destroyedRef.current) return;
    const rendition = renditionRef.current;
    if (!rendition || !command || handledCommand.current === command.id) return;

    handledCommand.current = command.id;
    devLog("command", { type: command.type, locator: command.type === "goTo" ? command.locator : undefined });
    safeCall(() => {
      if (command.type === "next") void rendition.next?.();
      if (command.type === "prev") void rendition.prev?.();
      if (command.type === "goTo" && command.locator.type !== "pdf-page") {
        void displayLocator(rendition, bookRef.current, command.locator).catch((error: unknown) => {
          devError("display command failed", error);
        });
      }
    });
  }, [command, ready]);

  useEffect(() => {
    let cancelled = false;
    const query = searchQuery.trim();

    async function searchBook() {
      const book = bookRef.current;
      if (!ready || !book || destroyedRef.current || query.length < 2) {
        onSearchResults([]);
        onSearchStatus({ state: "idle", query });
        return;
      }

      const spineItems = book.spine?.spineItems ?? [];
      const results: SearchResult[] = [];
      onSearchStatus({ state: "searching", query, searchedPages: 0, totalPages: spineItems.length, resultCount: 0 });

      for (const [index, item] of spineItems.entries()) {
        if (cancelled || destroyedRef.current || results.length >= 80) break;

        try {
          await item.load(book.load.bind(book));
          const found = item.find(query) ?? [];
          for (const match of found) {
            if (!match.cfi) continue;
            results.push({
              id: `epub-${results.length}-${match.cfi}`,
              label: item.href || "Section",
              excerpt: resultExcerpt(match.excerpt ?? ""),
              locator: { type: "epub-cfi", cfi: match.cfi },
            });
            if (results.length >= 80) break;
          }
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[epub-reader] search skipped section", item.href, error);
          }
        } finally {
          safeCall(() => item.unload?.());
        }

        if (!cancelled && !destroyedRef.current) {
          onSearchStatus({ state: "searching", query, searchedPages: index + 1, totalPages: spineItems.length, resultCount: results.length });
        }
      }

      if (!cancelled && !destroyedRef.current) {
        onSearchResults(results);
        onSearchStatus({ state: "done", query, searchedPages: spineItems.length, totalPages: spineItems.length, resultCount: results.length, truncated: results.length >= 80 });
      }
    }

    const timeout = window.setTimeout(() => void searchBook(), 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [onSearchResults, onSearchStatus, ready, searchQuery]);

  if (loadError) {
    return (
      <ReaderFailure
        title="EPUB unavailable"
        message={loadError}
        downloadUrl={fileUrl}
        onRetry={() => {
          setLoadError("");
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className={state.layout === "vertical" ? "reader-viewer vertical" : "reader-viewer paginated"}>
      {!ready ? <div className="loading-state">Loading EPUB</div> : null}
      <div
        ref={containerRef}
        className="epub-stage"
        style={{
          visibility: ready ? "visible" : "hidden",
          width: state.fitWidth ? "100%" : `${Math.max(420, Math.min(1180, state.zoom * 8))}px`,
          maxWidth: "100%",
        }}
      />
    </div>
  );
}
