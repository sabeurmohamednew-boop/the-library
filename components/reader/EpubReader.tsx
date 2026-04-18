"use client";

import ePub from "epubjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReaderFailure } from "@/components/reader/ReaderFailure";
import { ReaderLoadingState } from "@/components/reader/ReaderLoadingState";
import { READER_SHORTCUT_EVENT, type ReaderEngineProps, type ReaderLoadStatus, type ReaderShortcutDetail } from "@/components/reader/types";
import type { ReaderState, SearchResult, TocItem } from "@/lib/types";

const EPUB_FETCH_TIMEOUT_MS = 30000;
const EPUB_PARSE_TIMEOUT_MS = 20000;
const EPUB_RENDER_TIMEOUT_MS = 20000;
const EPUB_LAYOUT_TIMEOUT_MS = 5000;
const EPUB_CONTENT_TIMEOUT_MS = 6500;

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

function safeDecodeUri(value: string) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function safeDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function splitHrefFragment(href: string) {
  const hashIndex = href.indexOf("#");
  if (hashIndex < 0) return { base: href, fragment: "" };
  return {
    base: href.slice(0, hashIndex),
    fragment: href.slice(hashIndex + 1),
  };
}

function normalizeEpubPath(value: string) {
  const path = value.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts: string[] = [];

  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

function epubDirName(value: string) {
  const normalized = normalizeEpubPath(value);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(0, slashIndex) : "";
}

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function joinHrefFragment(base: string, fragment: string) {
  return fragment ? `${base}#${fragment}` : base;
}

function tocTargetSummary(item: TocItem) {
  return {
    id: item.id,
    label: item.label,
    depth: item.depth ?? 0,
    locator: item.locator,
  };
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

function devLog(message: string, data?: Record<string, unknown>) {
  console.info(`[epub-reader] ${message}`, {
    at: new Date().toISOString(),
    ...(data ?? {}),
  });
}

function errorSummary(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  return { message: String(error) };
}

function devError(message: string, error: unknown, data?: Record<string, unknown>) {
  console.error(`[epub-reader] ${message}`, {
    at: new Date().toISOString(),
    ...errorSummary(error),
    ...(data ?? {}),
  });
}

function headerValue(response: Response, name: string) {
  return response.headers.get(name) ?? "";
}

async function responseErrorMessage(response: Response, fallback: string) {
  const contentType = headerValue(response, "content-type").toLowerCase();

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
      }
    }

    const text = await response.text();
    if (text.trim()) {
      return text.trim().slice(0, 220);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function looksLikeEpubZip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

type ElementDiagnostics = {
  connected: boolean;
  display: string;
  visibility: string;
  rectWidth: number;
  rectHeight: number;
  clientWidth: number;
  clientHeight: number;
  offsetWidth: number;
  offsetHeight: number;
};

type RenditionDiagnostics = ElementDiagnostics & {
  contentsCount: number;
  epubContainerWidth: number;
  epubContainerHeight: number;
  iframeCount: number;
  iframeWidth: number;
  iframeHeight: number;
  bodyExists: boolean;
  bodyTextLength: number;
  bodyChildElementCount: number;
  bodyScrollHeight: number;
  bodyClientHeight: number;
  bodyReadyState: string;
  contentReadError?: string;
};

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

function measureElement(element: HTMLElement | null): ElementDiagnostics {
  if (!element) {
    return {
      connected: false,
      display: "missing",
      visibility: "missing",
      rectWidth: 0,
      rectHeight: 0,
      clientWidth: 0,
      clientHeight: 0,
      offsetWidth: 0,
      offsetHeight: 0,
    };
  }

  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  return {
    connected: element.isConnected,
    display: styles.display,
    visibility: styles.visibility,
    rectWidth: rounded(rect.width),
    rectHeight: rounded(rect.height),
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
  };
}

function hasUsableLayout(diagnostics: ElementDiagnostics) {
  const width = Math.max(diagnostics.rectWidth, diagnostics.clientWidth, diagnostics.offsetWidth);
  const height = Math.max(diagnostics.rectHeight, diagnostics.clientHeight, diagnostics.offsetHeight);

  return diagnostics.connected && diagnostics.display !== "none" && diagnostics.visibility !== "hidden" && width >= 120 && height >= 120;
}

async function waitForElementLayout(element: HTMLElement | null, timeoutMs = EPUB_LAYOUT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let diagnostics = measureElement(element);
  devLog("stage:layout-wait:start", diagnostics);

  while (Date.now() - startedAt < timeoutMs) {
    diagnostics = measureElement(element);
    if (hasUsableLayout(diagnostics)) {
      devLog("stage:layout-ready", { elapsedMs: Date.now() - startedAt, ...diagnostics });
      return diagnostics;
    }

    await sleep(80);
  }

  const error = new Error("EPUB reader stage never received usable layout.");
  (error as Error & { diagnostics?: ElementDiagnostics }).diagnostics = diagnostics;
  devError("stage:layout-timeout", error, diagnostics);
  throw error;
}

function getRenditionSize(element: HTMLElement | null) {
  const diagnostics = measureElement(element);
  return {
    width: Math.max(320, Math.floor(diagnostics.rectWidth || diagnostics.clientWidth || diagnostics.offsetWidth || 0)),
    height: Math.max(320, Math.floor(diagnostics.rectHeight || diagnostics.clientHeight || diagnostics.offsetHeight || 0)),
  };
}

function collectRenditionDiagnostics(rendition: any, element: HTMLElement | null): RenditionDiagnostics {
  const elementDiagnostics = measureElement(element);
  const contents = typeof rendition?.getContents === "function" ? rendition.getContents() : [];
  const epubContainer = element?.querySelector(".epub-container") as HTMLElement | null;
  const epubContainerRect = epubContainer?.getBoundingClientRect();
  const firstIframe = element?.querySelector("iframe") as HTMLIFrameElement | null;
  const iframeRect = firstIframe?.getBoundingClientRect();
  let bodyExists = false;
  let bodyTextLength = 0;
  let bodyChildElementCount = 0;
  let bodyScrollHeight = 0;
  let bodyClientHeight = 0;
  let bodyReadyState = "";
  let contentReadError: string | undefined;

  try {
    const firstContent = contents[0];
    const documentElement =
      (firstContent?.document as Document | undefined) ??
      (firstContent?.window?.document as Document | undefined) ??
      firstIframe?.contentDocument ??
      null;
    const body = documentElement?.body ?? null;

    bodyExists = Boolean(body);
    bodyTextLength = body?.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
    bodyChildElementCount = body?.childElementCount ?? 0;
    bodyScrollHeight = body?.scrollHeight ?? 0;
    bodyClientHeight = body?.clientHeight ?? 0;
    bodyReadyState = documentElement?.readyState ?? "";
  } catch (error) {
    contentReadError = error instanceof Error ? error.message : String(error);
  }

  return {
    ...elementDiagnostics,
    contentsCount: contents.length,
    epubContainerWidth: rounded(epubContainerRect?.width ?? 0),
    epubContainerHeight: rounded(epubContainerRect?.height ?? 0),
    iframeCount: element?.querySelectorAll("iframe").length ?? 0,
    iframeWidth: rounded(iframeRect?.width ?? 0),
    iframeHeight: rounded(iframeRect?.height ?? 0),
    bodyExists,
    bodyTextLength,
    bodyChildElementCount,
    bodyScrollHeight,
    bodyClientHeight,
    bodyReadyState,
    ...(contentReadError ? { contentReadError } : {}),
  };
}

function hasVisibleRenditionContent(diagnostics: RenditionDiagnostics) {
  return (
    hasUsableLayout(diagnostics) &&
    diagnostics.contentsCount > 0 &&
    diagnostics.iframeCount > 0 &&
    diagnostics.iframeWidth > 0 &&
    diagnostics.iframeHeight > 0 &&
    diagnostics.bodyExists &&
    (diagnostics.bodyTextLength > 0 || diagnostics.bodyChildElementCount > 0 || diagnostics.bodyScrollHeight > 0)
  );
}

async function waitForVisibleRenditionContent(rendition: any, element: HTMLElement | null, timeoutMs = EPUB_CONTENT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let diagnostics = collectRenditionDiagnostics(rendition, element);
  devLog("contents:wait:start", diagnostics);

  while (Date.now() - startedAt < timeoutMs) {
    diagnostics = collectRenditionDiagnostics(rendition, element);
    if (hasVisibleRenditionContent(diagnostics)) {
      devLog("contents:first-rendered", { elapsedMs: Date.now() - startedAt, ...diagnostics });
      return diagnostics;
    }

    await sleep(100);
  }

  const error = new Error("EPUB display completed without visible iframe content.");
  (error as Error & { diagnostics?: RenditionDiagnostics }).diagnostics = diagnostics;
  devError("contents:wait-timeout", error, diagnostics);
  throw error;
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
  const { width, height } = getRenditionSize(element);
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

type EpubDisplayTarget =
  | { mode: "restore"; value: string; label: string }
  | { mode: "start"; value?: string; label: string };

function normalizeRestoredCfi(value: string | undefined) {
  const cfi = value?.trim() ?? "";
  if (!cfi) return "";
  return cfi.startsWith("epubcfi(") ? cfi : "";
}

function getBookStartTarget(book: any) {
  const spineItems = Array.isArray(book?.spine?.spineItems) ? book.spine.spineItems : [];
  const firstLinearItem = spineItems.find((item: any) => item?.linear !== "no");
  const firstItem = firstLinearItem ?? spineItems[0] ?? (typeof book?.spine?.first === "function" ? book.spine.first() : null);
  const href = typeof firstItem?.href === "string" ? firstItem.href.trim() : "";
  return href || undefined;
}

function targetStatusMessage(target: EpubDisplayTarget, attempt: number) {
  if (target.mode === "restore") {
    return attempt === 1 ? "Opening saved position" : "Retrying saved position";
  }

  return attempt === 1 ? "Opening book start" : "Retrying book start";
}

function progressFromEpubLocation(book: any, location: any, cfi: string) {
  try {
    const progress = book.locations?.percentageFromCfi(cfi);
    if (typeof progress === "number" && Number.isFinite(progress)) {
      return Math.max(0, Math.min(1, progress));
    }
  } catch {
    // Fall through to rendition or spine index estimates while locations are still generating.
  }

  const renditionProgress = location?.start?.percentage;
  if (typeof renditionProgress === "number" && Number.isFinite(renditionProgress)) {
    return Math.max(0, Math.min(1, renditionProgress));
  }

  const spineItems = Array.isArray(book?.spine?.spineItems) ? book.spine.spineItems : [];
  const spineIndex = location?.start?.index;
  if (typeof spineIndex === "number" && Number.isFinite(spineIndex) && spineItems.length > 1) {
    return Math.max(0, Math.min(1, spineIndex / (spineItems.length - 1)));
  }

  return 0;
}

function resolveEpubHrefDisplayTarget(book: any, href: string) {
  const rawHref = href.trim();
  const { base, fragment } = splitHrefFragment(rawHref);
  const navigationPath = book?.packaging?.navPath || book?.packaging?.ncxPath || "";
  const navigationDir = epubDirName(navigationPath);
  const decodedBase = safeDecodeUri(base);
  const decodedFragment = safeDecodeUriComponent(fragment);
  const baseCandidates = uniqueNonEmpty([
    base,
    decodedBase,
    normalizeEpubPath(base),
    normalizeEpubPath(decodedBase),
    navigationDir ? normalizeEpubPath(`${navigationDir}/${base}`) : "",
    navigationDir ? normalizeEpubPath(`${navigationDir}/${decodedBase}`) : "",
  ]);
  const fragmentCandidates = [...new Set([fragment, decodedFragment])];
  const targets = baseCandidates.flatMap((candidate) => fragmentCandidates.map((candidateFragment) => joinHrefFragment(candidate, candidateFragment)));

  for (const target of targets) {
    const targetBase = splitHrefFragment(target).base;
    const section = book?.spine?.get?.(target) ?? book?.spine?.get?.(targetBase);
    if (section) {
      return {
        target,
        section,
        candidates: targets,
      };
    }
  }

  return {
    target: rawHref,
    section: null,
    candidates: targets.length > 0 ? targets : [rawHref],
  };
}

async function displayLocator(
  rendition: any,
  book: any,
  locator: SearchResult["locator"],
  options: { element?: HTMLElement | null; source?: string } = {},
) {
  if (locator.type === "epub-cfi") {
    devLog("navigation:display:start", { source: options.source ?? "command", locator, target: locator.cfi });
    if (options.element) {
      await waitForElementLayout(options.element, EPUB_LAYOUT_TIMEOUT_MS);
      safeCall(() => resizeRenditionToElement(rendition, options.element ?? null));
    }
    await withTimeout(Promise.resolve(rendition.display?.(locator.cfi)), "rendition.display command", EPUB_RENDER_TIMEOUT_MS);
    if (options.element) {
      await waitForVisibleRenditionContent(rendition, options.element, EPUB_CONTENT_TIMEOUT_MS);
    }
    safeCall(() => rendition.reportLocation?.());
    devLog("navigation:display:success", { source: options.source ?? "command", locator, currentLocation: typeof rendition.currentLocation === "function" ? rendition.currentLocation() : null });
    return;
  }

  if (locator.type === "epub-href") {
    const resolved = resolveEpubHrefDisplayTarget(book, locator.href);
    devLog("navigation:toc-target", {
      source: options.source ?? "command",
      href: locator.href,
      resolvedTarget: resolved.target,
      candidateCount: resolved.candidates.length,
      candidates: resolved.candidates.slice(0, 8),
      sectionHref: resolved.section?.href,
      sectionIndex: resolved.section?.index,
    });

    if (options.element) {
      await waitForElementLayout(options.element, EPUB_LAYOUT_TIMEOUT_MS);
      safeCall(() => resizeRenditionToElement(rendition, options.element ?? null));
    }

    devLog("navigation:display:start", { source: options.source ?? "command", locator, target: resolved.target });
    await withTimeout(Promise.resolve(rendition.display?.(resolved.target)), "rendition.display command", EPUB_RENDER_TIMEOUT_MS);
    if (options.element) {
      await waitForVisibleRenditionContent(rendition, options.element, EPUB_CONTENT_TIMEOUT_MS);
    }
    safeCall(() => rendition.reportLocation?.());
    devLog("navigation:display:success", {
      source: options.source ?? "command",
      locator,
      target: resolved.target,
      currentLocation: typeof rendition.currentLocation === "function" ? rendition.currentLocation() : null,
    });
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
  onLoadStatus,
}: ReaderEngineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const destroyedRef = useRef(false);
  const handledCommand = useRef(0);
  const lastCfi = useRef("");
  const initialCfi = useRef(state.epubCfi);
  const stateEpubCfiRef = useRef(state.epubCfi);
  const contentKeyboardDocumentsRef = useRef<WeakSet<Document>>(new WeakSet());
  const contentKeyboardCleanupsRef = useRef<Array<() => void>>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loadMessage, setLoadMessage] = useState("Loading EPUB");
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
    stateEpubCfiRef.current = state.epubCfi;
  }, [state.epubCfi]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let cancelled = false;
    let fetchTimeout: number | null = null;
    let fetchTimedOut = false;
    let failed = false;
    let loadSettled = false;
    const abortController = new AbortController();
    destroyedRef.current = false;
    setReady(false);
    setLoadError("");
    setLoadMessage("Loading EPUB");
    initialCfi.current = stateEpubCfiRef.current;
    lastCfi.current = "";
    onError("");
    onLoadStatus({ phase: "idle", message: "Preparing EPUB reader" });
    onTocChange([]);
    onSearchResults([]);
    onSearchStatus({ state: "idle", query: "" });
    element.replaceChildren();
    contentKeyboardCleanupsRef.current.forEach((cleanup) => cleanup());
    contentKeyboardCleanupsRef.current = [];
    contentKeyboardDocumentsRef.current = new WeakSet();

    function reportStatus(status: ReaderLoadStatus) {
      if (cancelled || destroyedRef.current || failed) return;
      setLoadMessage(status.message);
      onLoadStatus(status);
      devLog("status", status);
    }

    function failLoad(message: string, error: unknown) {
      if (cancelled || destroyedRef.current) return;
      failed = true;
      loadSettled = true;
      setReady(false);
      setLoadError(message);
      onError(message);
      onLoadStatus({ phase: "error", message });
      devError("load failed", error);
    }

    function handleWindowError(event: ErrorEvent) {
      if (loadSettled) return;
      devError("window:error-during-epub-load", event.error ?? event.message, { source: event.filename, line: event.lineno, column: event.colno });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      if (loadSettled) return;
      devError("window:unhandled-rejection-during-epub-load", event.reason);
    }

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    async function waitForInitialStageLayout() {
      try {
        return await waitForElementLayout(element, EPUB_LAYOUT_TIMEOUT_MS);
      } catch (firstLayoutError) {
        if (cancelled || destroyedRef.current || failed) throw firstLayoutError;
        devError("stage:initial-layout-first-attempt-failed", firstLayoutError, measureElement(element));
        reportStatus({ phase: "retrying", message: "Retrying reader layout" });
        await sleep(180);
        return waitForElementLayout(element, EPUB_LAYOUT_TIMEOUT_MS);
      }
    }

    async function loadBook() {
      let book: any = null;
      let rendition: any = null;
      let removeRelocatedListener: (() => void) | undefined;

      try {
        reportStatus({ phase: "fetching", message: "Fetching EPUB file" });
        devLog("fetch:start", { url: fileUrl });
        fetchTimeout = window.setTimeout(() => {
          fetchTimedOut = true;
          abortController.abort();
        }, EPUB_FETCH_TIMEOUT_MS);
        const response = await fetch(fileUrl, { cache: "no-store", signal: abortController.signal });
        if (fetchTimeout !== null) {
          window.clearTimeout(fetchTimeout);
          fetchTimeout = null;
        }
        if (cancelled || destroyedRef.current || failed) return undefined;
        devLog("fetch:end", {
          url: response.url,
          status: response.status,
          ok: response.ok,
          contentType: headerValue(response, "content-type"),
          contentLength: headerValue(response, "content-length"),
          acceptRanges: headerValue(response, "accept-ranges"),
        });

        if (!response.ok) {
          const detail = await responseErrorMessage(response, "Book file is unavailable.");
          throw new Error(`EPUB request failed with status ${response.status}: ${detail}`);
        }

        const contentType = headerValue(response, "content-type").toLowerCase();
        if (contentType.includes("text/html") || contentType.includes("application/json")) {
          const detail = await responseErrorMessage(response, "The reader received a non-EPUB response.");
          throw new Error(`EPUB request returned ${contentType || "an unsupported response"}: ${detail}`);
        }

        reportStatus({ phase: "parsing", message: "Reading EPUB file" });
        const buffer = await withTimeout(response.arrayBuffer(), "EPUB download", EPUB_FETCH_TIMEOUT_MS);
        if (cancelled || destroyedRef.current || failed) return undefined;
        devLog("fetch:blob", { byteLength: buffer.byteLength });

        if (buffer.byteLength <= 0) {
          throw new Error("EPUB response was empty.");
        }

        if (!looksLikeEpubZip(buffer)) {
          throw new Error("EPUB response did not look like a valid EPUB/ZIP file.");
        }

        reportStatus({ phase: "parsing", message: "Parsing EPUB package" });
        devLog("epub:init", { byteLength: buffer.byteLength });
        book = ePub(buffer);
        if (cancelled || destroyedRef.current || failed) {
          safeCall(() => book?.destroy?.());
          return undefined;
        }
        bookRef.current = book;

        devLog("epub:open:start");
        await withTimeout(Promise.resolve(book.opened ?? book.ready), "book.opened", EPUB_PARSE_TIMEOUT_MS);
        if (cancelled || destroyedRef.current || failed) {
          safeCall(() => book?.destroy?.());
          return undefined;
        }
        devLog("epub:open:end");

        book.ready?.catch((error: unknown) => {
          devError("book.ready rejected", error);
        });

        reportStatus({ phase: "rendering", message: "Waiting for reader layout" });
        await waitForInitialStageLayout();
        if (cancelled || destroyedRef.current || failed) {
          safeCall(() => book?.destroy?.());
          return undefined;
        }

        reportStatus({ phase: "rendering", message: "Creating EPUB renderer" });
        const initialSize = getRenditionSize(element);
        devLog("rendition:renderTo:start", { ...initialSize, stage: measureElement(element) });
        rendition = book.renderTo(element, {
          width: initialSize.width,
          height: initialSize.height,
          flow: settingsRef.current.layout === "vertical" ? "scrolled-doc" : "paginated",
          spread: settingsRef.current.layout === "paginated" && settingsRef.current.dualPage ? "always" : "none",
          manager: "default",
        });
        if (cancelled || destroyedRef.current || failed) {
          safeCall(() => rendition?.destroy?.());
          safeCall(() => book?.destroy?.());
          return undefined;
        }
        renditionRef.current = rendition;
        devLog("rendition:renderTo:done", collectRenditionDiagnostics(rendition, element));

        const handleRelocated = (location: any) => {
          if (cancelled || destroyedRef.current || failed) return;
          const cfi = location?.start?.cfi;
          if (!cfi || cfi === lastCfi.current) return;
          lastCfi.current = cfi;

          const progress = progressFromEpubLocation(book, location, cfi);

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
          devLog("rendition:rendered", collectRenditionDiagnostics(rendition, element));
          applyCurrentContentStyles();
        };
        const handleDisplayed = (_section: unknown) => {
          devLog("rendition:displayed", collectRenditionDiagnostics(rendition, element));
          applyCurrentContentStyles();
        };
        const handleLayout = (_layout: unknown) => {
          devLog("rendition:layout", collectRenditionDiagnostics(rendition, element));
          applyCurrentContentStyles();
        };
        const handleRendering = (_section: unknown) => {
          devLog("rendition:rendering", measureElement(element));
        };
        const handleRenditionError = (error: unknown) => {
          devError("rendition:event-error", error, collectRenditionDiagnostics(rendition, element));
        };

        rendition.on?.("relocated", handleRelocated);
        rendition.on?.("rendered", handleRendered);
        rendition.on?.("displayed", handleDisplayed);
        rendition.on?.("rendering", handleRendering);
        rendition.on?.("layout", handleLayout);
        rendition.on?.("displayerror", handleRenditionError);
        rendition.on?.("loaderror", handleRenditionError);
        removeRelocatedListener = () => {
          rendition.off?.("relocated", handleRelocated);
          rendition.off?.("rendered", handleRendered);
          rendition.off?.("displayed", handleDisplayed);
          rendition.off?.("rendering", handleRendering);
          rendition.off?.("layout", handleLayout);
          rendition.off?.("displayerror", handleRenditionError);
          rendition.off?.("loaderror", handleRenditionError);
          rendition.off?.("error", handleRenditionError);
        };
        rendition.on?.("error", handleRenditionError);
        rendition.hooks?.content?.register?.((contents: any) => {
          applyContentStyleToContent(contents, settingsRef.current);
          bindContentKeyboardShortcuts(contents, contentKeyboardDocumentsRef, contentKeyboardCleanupsRef);
        });

        applySettings(rendition, settingsRef.current, { resize: false, container: element });

        devLog("book.ready:start");
        await withTimeout(book.ready, "book.ready", EPUB_PARSE_TIMEOUT_MS);
        if (cancelled || destroyedRef.current || failed) return;
        devLog("book.ready:done");

        const navigation = await book.loaded.navigation.catch((error: unknown) => {
          devError("navigation load failed", error);
          return null;
        });
        if (!cancelled && !destroyedRef.current && !failed) {
          const tocItems = flattenToc(navigation?.toc ?? []);
          devLog("toc:loaded", {
            count: tocItems.length,
            rawCount: Array.isArray(navigation?.toc) ? navigation.toc.length : 0,
            sample: tocItems.slice(0, 8).map(tocTargetSummary),
          });
          onTocChange(tocItems);
        }

        async function displayAndValidate(target: EpubDisplayTarget, attempt: number) {
          reportStatus({
            phase: attempt === 1 ? "rendering" : "retrying",
            message: targetStatusMessage(target, attempt),
          });
          await waitForElementLayout(element, EPUB_LAYOUT_TIMEOUT_MS);
          if (cancelled || destroyedRef.current || failed) return null;

          safeCall(() => resizeRenditionToElement(rendition, element));
          applyContentStyles(rendition, settingsRef.current);
          devLog("rendition.display:start", {
            attempt,
            mode: target.mode,
            label: target.label,
            target: target.value ?? "spine-default",
            stage: measureElement(element),
          });
          const displayPromise = target.value ? rendition.display(target.value) : rendition.display();
          await withTimeout(Promise.resolve(displayPromise), "rendition.display", EPUB_RENDER_TIMEOUT_MS);
          if (cancelled || destroyedRef.current || failed) return null;

          devLog("rendition.display:end", { attempt, mode: target.mode, target: target.value ?? "spine-default", diagnostics: collectRenditionDiagnostics(rendition, element) });
          const diagnostics = await waitForVisibleRenditionContent(rendition, element, EPUB_CONTENT_TIMEOUT_MS);
          if (cancelled || destroyedRef.current || failed) return null;

          safeCall(() => rendition.reportLocation?.());
          const currentLocation = typeof rendition.currentLocation === "function" ? rendition.currentLocation() : null;
          if (currentLocation) handleRelocated(currentLocation);

          return diagnostics;
        }

        async function displayWithRetry(target: EpubDisplayTarget) {
          try {
            return await displayAndValidate(target, 1);
          } catch (firstDisplayError) {
            if (cancelled || destroyedRef.current || failed) return null;
            devError(`rendition.display:${target.mode}:first-attempt-failed`, firstDisplayError, collectRenditionDiagnostics(rendition, element));
            reportStatus({ phase: "retrying", message: targetStatusMessage(target, 2) });
            await sleep(180);
            return displayAndValidate(target, 2);
          }
        }

        const savedCfi = initialCfi.current?.trim() ?? "";
        const restoredCfi = normalizeRestoredCfi(savedCfi);
        const startTarget: EpubDisplayTarget = { mode: "start", value: getBookStartTarget(book), label: "book start" };
        const restoreTarget: EpubDisplayTarget | null = restoredCfi ? { mode: "restore", value: restoredCfi, label: "saved CFI" } : null;

        devLog("restore:target", {
          hasSavedCfi: Boolean(savedCfi),
          savedCfiLength: savedCfi.length,
          savedCfiLooksValid: Boolean(restoredCfi),
          usingSavedCfi: Boolean(restoreTarget),
          startHref: startTarget.value ?? "spine-default",
        });

        if (savedCfi && !restoredCfi) {
          devError("restore:invalid-cfi-syntax", new Error("Saved EPUB CFI did not start with epubcfi(."), { savedCfiLength: savedCfi.length });
        }

        if (restoreTarget) {
          try {
            await displayWithRetry(restoreTarget);
          } catch (restoreError) {
            if (cancelled || destroyedRef.current || failed) return;
            devError("restore:fallback-to-start", restoreError, {
              savedCfiLength: restoredCfi.length,
              startHref: startTarget.value ?? "spine-default",
              diagnostics: collectRenditionDiagnostics(rendition, element),
            });
            initialCfi.current = "";
            lastCfi.current = "";
            reportStatus({ phase: "retrying", message: "Saved position unavailable; opening book start" });
            await sleep(180);
            await displayWithRetry(startTarget);
          }
        } else {
          await displayWithRetry(startTarget);
        }

        if (cancelled || destroyedRef.current || failed) return;
        const activeContents = typeof rendition?.getContents === "function" ? rendition.getContents() : [];
        activeContents.forEach((content: any) => bindContentKeyboardShortcuts(content, contentKeyboardDocumentsRef, contentKeyboardCleanupsRef));

        setReady(true);
        loadSettled = true;
        reportStatus({ phase: "ready", message: "EPUB ready" });
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
        if (cancelled || destroyedRef.current || failed) return undefined;
        abortController.abort();
        const isAbort = typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "AbortError";
        const detail = fetchTimedOut && isAbort ? " EPUB request timed out." : error instanceof Error && error.message ? ` ${error.message}` : "";
        const message = `This EPUB could not be loaded. The file may be missing, blocked, or invalid.${detail}`;
        failLoad(message, error);
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
      if (fetchTimeout !== null) {
        window.clearTimeout(fetchTimeout);
      }
      abortController.abort();
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      removeListeners?.();
      contentKeyboardCleanupsRef.current.forEach((cleanup) => cleanup());
      contentKeyboardCleanupsRef.current = [];
      contentKeyboardDocumentsRef.current = new WeakSet();
      safeCall(() => renditionRef.current?.destroy?.());
      safeCall(() => bookRef.current?.destroy?.());
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [fileUrl, onError, onLoadStatus, onLocationChange, onSearchResults, onSearchStatus, onTocChange, retryKey]);

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
    if (command.type === "next") {
      void rendition.next?.();
      return;
    }
    if (command.type === "prev") {
      void rendition.prev?.();
      return;
    }
    if (command.type !== "goTo") return;
    const locator = command.locator;
    if (locator.type !== "pdf-page") {
      void displayLocator(rendition, bookRef.current, locator, { element: containerRef.current, source: "reader-command" }).catch((error: unknown) => {
        devError("navigation:display:failed", error, {
          locator,
          diagnostics: collectRenditionDiagnostics(rendition, containerRef.current),
        });
      });
    }
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
    <div className={state.layout === "vertical" ? "reader-viewer vertical epub-reader-viewer" : "reader-viewer paginated epub-reader-viewer"}>
      {!ready ? (
        <div className="reader-loading-cover">
          <ReaderLoadingState detail={loadMessage} />
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="epub-stage"
        style={{
          width: state.fitWidth ? "100%" : `${Math.max(420, Math.min(1180, state.zoom * 8))}px`,
          maxWidth: "100%",
        }}
      />
    </div>
  );
}
