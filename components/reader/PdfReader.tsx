"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import {
  AnnotationLayer,
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import type { ReaderEngineProps, ReaderSearchStatus, ReaderSelection } from "@/components/reader/types";
import type { ReaderAnnotation, ReaderLocator, SearchResult, TocItem } from "@/lib/types";
import { ReaderFailure } from "@/components/reader/ReaderFailure";
import { ReaderLoadingFrame } from "@/components/reader/ReaderLoadingState";

GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

const PDF_SEARCH_DEBOUNCE_MS = 180;
const PDF_SEARCH_BATCH_SIZE = 4;
const PDF_SEARCH_RESULT_LIMIT = 120;
const PDF_VERTICAL_PAGE_WINDOW_BEFORE = 3;
const PDF_VERTICAL_PAGE_WINDOW_AFTER = 5;
const PDF_LOAD_TIMEOUT_MS = 30000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTocText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 30000) {
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

function useElementWidth<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    setElement(node);
  }, []);

  useLayoutEffect(() => {
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    });

    observer.observe(element);
    const initialWidth = Math.round(element.getBoundingClientRect().width);
    setWidth((current) => (current === initialWidth ? current : initialWidth));

    return () => observer.disconnect();
  }, [element]);

  return [ref, width] as const;
}

function createLinkService(onDestination: (destination: unknown) => void) {
  return {
    externalLinkEnabled: true,
    externalLinkRel: "noopener noreferrer nofollow",
    externalLinkTarget: 2,
    addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow = true) {
      link.href = url;
      link.rel = "noopener noreferrer nofollow";
      link.target = newWindow ? "_blank" : "_self";
    },
    getDestinationHash() {
      return "";
    },
    getAnchorUrl(hash: string) {
      return hash;
    },
    goToDestination(destination: unknown) {
      onDestination(destination);
    },
    navigateTo(destination: unknown) {
      onDestination(destination);
    },
    executeNamedAction() {},
    executeSetOCGState() {},
    eventBus: null,
  };
}

function pageNumberFromIndex(pageIndex: number, pageCount: number) {
  if (!Number.isInteger(pageIndex)) return null;
  return clamp(pageIndex + 1, 1, pageCount);
}

async function destinationToPage(pdf: PDFDocumentProxy, destination: unknown): Promise<number | null> {
  const explicitDestination = typeof destination === "string" ? await pdf.getDestination(destination) : destination;

  if (typeof explicitDestination === "number") {
    return pageNumberFromIndex(explicitDestination, pdf.numPages);
  }

  const first = Array.isArray(explicitDestination) ? explicitDestination[0] : explicitDestination;

  if (typeof first === "number") {
    return pageNumberFromIndex(first, pdf.numPages);
  }

  if (first && typeof first === "object") {
    if ("dest" in first) {
      return destinationToPage(pdf, (first as { dest: unknown }).dest);
    }

    const pageIndex = await pdf.getPageIndex(first as never);
    return pageIndex + 1;
  }

  return null;
}

async function flattenOutline(pdf: PDFDocumentProxy, items: any[] | null | undefined, depth = 0, path = "0"): Promise<TocItem[]> {
  if (!items?.length) return [];

  const output: TocItem[] = [];
  for (const [index, item] of items.entries()) {
    const page = await destinationToPage(pdf, item.dest).catch(() => null);
    const children = await flattenOutline(pdf, item.items, depth + 1, `${path}-${index}`);
    const fallbackPage = children.reduce<number | null>((foundPage, child) => {
      if (foundPage !== null) return foundPage;
      return child.locator.type === "pdf-page" ? child.locator.page : null;
    }, null);
    const targetPage = page ?? fallbackPage ?? null;
    if (targetPage !== null) {
      output.push({
        id: `${path}-${index}-${targetPage}-${item.title}`,
        label: item.title,
        locator: { type: "pdf-page", page: targetPage },
        depth,
      });
    }

    output.push(...children);
  }

  return output;
}

function excerptFor(text: string, query: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const normalized = cleaned.toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  const index = normalized.indexOf(normalizedQuery);
  if (index < 0) return cleaned.slice(0, 130);
  const start = Math.max(0, index - 52);
  const end = Math.min(cleaned.length, index + normalizedQuery.length + 72);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < cleaned.length ? " ..." : "";
  return `${prefix}${cleaned.slice(start, end).trim()}${suffix}`;
}

type CachedPageText = {
  text: string;
  normalized: string;
};

type OutlineTarget = {
  id: string;
  label: string;
  page: number;
};

async function getCachedPageText(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  textCache: Map<number, CachedPageText>,
  textPromiseCache: Map<number, Promise<CachedPageText>>,
) {
  const cached = textCache.get(pageNumber);
  if (cached) return cached;

  const pending = textPromiseCache.get(pageNumber);
  if (pending) return pending;

  const promise = pdf
    .getPage(pageNumber)
    .then(async (page) => {
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
      const pageText = {
        text: text.replace(/\s+/g, " ").trim(),
        normalized: normalizeSearchText(text),
      };
      textCache.set(pageNumber, pageText);
      return pageText;
    })
    .finally(() => {
      textPromiseCache.delete(pageNumber);
    });

  textPromiseCache.set(pageNumber, promise);
  return promise;
}

type PdfPageViewProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  searchQuery: string;
  annotations: ReaderAnnotation[];
  outlineTargets: OutlineTarget[];
  observeVisibility: boolean;
  onVisible: (page: number) => void;
  onNavigatePage: (page: number) => void;
  onNavigateDestination: (destination: unknown) => void;
  onPageError: (message: string) => void;
};

function expandNarrowAnnotationLinks(annotationLayerElement: HTMLDivElement, annotations: any[], viewport: ReturnType<PDFPageProxy["getViewport"]>) {
  const links = Array.from(annotationLayerElement.querySelectorAll<HTMLAnchorElement>("a"));
  const linkAnnotations = annotations.filter((annotation) => annotation.subtype === "Link" && Array.isArray(annotation.rect));

  linkAnnotations.forEach((annotation, index) => {
    const link = links[index];
    if (!link) return;

    const rect = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(rect[0], rect[2]);
    const right = Math.max(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const bottom = Math.max(rect[1], rect[3]);
    const width = right - left;

    if (width > 12 * viewport.scale) return;

    const expandedLeft = Math.max(0, 90 * viewport.scale);
    const expandedTop = Math.max(0, top - 2 * viewport.scale);
    link.classList.add("pdf-expanded-link");
    link.style.left = `${expandedLeft}px`;
    link.style.top = `${expandedTop}px`;
    link.style.width = `${Math.max(right - expandedLeft + 4 * viewport.scale, 44)}px`;
    link.style.height = `${Math.max(bottom - top + 4 * viewport.scale, 18)}px`;
  });
}

function installOutlineTextLinks(
  textLayerElement: HTMLDivElement,
  textDivs: HTMLElement[],
  textItems: string[],
  outlineTargets: OutlineTarget[],
  onNavigatePage: (page: number) => void,
) {
  const targetByText = new Map<string, OutlineTarget>();
  outlineTargets.forEach((target) => {
    targetByText.set(normalizeTocText(target.label), target);
  });

  const overlays: HTMLButtonElement[] = [];
  const frame = window.requestAnimationFrame(() => {
    if (!textLayerElement.isConnected) return;
    const layerRect = textLayerElement.getBoundingClientRect();

    textDivs.forEach((div, index) => {
      const target = targetByText.get(normalizeTocText(textItems[index] ?? ""));
      if (!target) return;

      const rect = div.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 6) return;

      const overlay = document.createElement("button");
      overlay.type = "button";
      overlay.className = "pdf-text-outline-link";
      overlay.setAttribute("aria-label", `Go to ${target.label}`);
      overlay.title = target.label;
      overlay.style.top = `${Math.max(0, rect.top - layerRect.top - 3)}px`;
      overlay.style.height = `${Math.max(20, rect.height + 6)}px`;
      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onNavigatePage(target.page);
      });
      textLayerElement.appendChild(overlay);
      overlays.push(overlay);
    });
  });

  return () => {
    window.cancelAnimationFrame(frame);
    overlays.forEach((overlay) => overlay.remove());
  };
}

function installSearchHighlights(
  highlightLayerElement: HTMLDivElement,
  textLayerElement: HTMLDivElement,
  textDivs: HTMLElement[],
  textItems: string[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length < 2) return () => undefined;

  const pieces: { div: HTMLElement; text: string; start: number; end: number }[] = [];
  let searchableText = "";

  textItems.forEach((text, index) => {
    const value = text ?? "";
    const div = textDivs[index];
    if (!value || !div) return;

    if (searchableText.length > 0) {
      searchableText += " ";
    }

    const start = searchableText.length;
    searchableText += value.toLowerCase();
    pieces.push({ div, text: value, start, end: searchableText.length });
  });

  const marks: HTMLSpanElement[] = [];
  const frame = window.requestAnimationFrame(() => {
    if (!textLayerElement.isConnected || !highlightLayerElement.isConnected) return;
    const overlayRect = highlightLayerElement.getBoundingClientRect();
    let searchFrom = 0;
    let matchCount = 0;

    while (matchCount < 80) {
      const matchStart = searchableText.indexOf(normalizedQuery, searchFrom);
      if (matchStart < 0) break;
      const matchEnd = matchStart + normalizedQuery.length;

      pieces.forEach((piece) => {
        if (piece.end <= matchStart || piece.start >= matchEnd) return;
        const node = Array.from(piece.div.childNodes).find((child) => child.nodeType === Node.TEXT_NODE);
        if (!node?.textContent) return;

        const startOffset = clamp(matchStart - piece.start, 0, node.textContent.length);
        const endOffset = clamp(matchEnd - piece.start, 0, node.textContent.length);
        if (endOffset <= startOffset) return;

        const range = document.createRange();
        range.setStart(node, startOffset);
        range.setEnd(node, endOffset);

        Array.from(range.getClientRects()).forEach((rect) => {
          if (rect.width <= 0 || rect.height <= 0) return;
          const left = clamp(rect.left - overlayRect.left, 0, overlayRect.width);
          const right = clamp(rect.right - overlayRect.left, 0, overlayRect.width);
          const top = clamp(rect.top - overlayRect.top, 0, overlayRect.height);
          const bottom = clamp(rect.bottom - overlayRect.top, 0, overlayRect.height);
          if (right <= left || bottom <= top) return;
          const mark = document.createElement("span");
          mark.className = "pdf-search-mark";
          mark.style.left = `${left}px`;
          mark.style.top = `${top}px`;
          mark.style.width = `${right - left}px`;
          mark.style.height = `${bottom - top}px`;
          highlightLayerElement.appendChild(mark);
          marks.push(mark);
        });

        range.detach();
      });

      matchCount += 1;
      searchFrom = matchEnd;
    }
  });

  return () => {
    window.cancelAnimationFrame(frame);
    marks.forEach((mark) => mark.remove());
  };
}

function installUserAnnotationHighlights(
  highlightLayerElement: HTMLDivElement,
  textLayerElement: HTMLDivElement,
  textDivs: HTMLElement[],
  textItems: string[],
  annotations: ReaderAnnotation[],
) {
  if (annotations.length === 0) return () => undefined;

  const pieces: { div: HTMLElement; text: string; start: number; end: number }[] = [];
  let searchableText = "";

  textItems.forEach((text, index) => {
    const value = text ?? "";
    const div = textDivs[index];
    if (!value || !div) return;

    if (searchableText.length > 0) searchableText += " ";
    const start = searchableText.length;
    searchableText += value.toLowerCase();
    pieces.push({ div, text: value, start, end: searchableText.length });
  });

  const marks: HTMLSpanElement[] = [];
  const frame = window.requestAnimationFrame(() => {
    if (!textLayerElement.isConnected || !highlightLayerElement.isConnected) return;
    const overlayRect = highlightLayerElement.getBoundingClientRect();

    annotations.forEach((annotation) => {
      const normalizedQuote = normalizeSearchText(annotation.quote).slice(0, 160);
      const query = normalizedQuote.length > 8 ? normalizedQuote : normalizeSearchText(annotation.quote);
      if (query.length < 2) return;

      const matchStart = searchableText.indexOf(query);
      if (matchStart < 0) return;
      const matchEnd = matchStart + query.length;

      pieces.forEach((piece) => {
        if (piece.end <= matchStart || piece.start >= matchEnd) return;
        const node = Array.from(piece.div.childNodes).find((child) => child.nodeType === Node.TEXT_NODE);
        if (!node?.textContent) return;

        const startOffset = clamp(matchStart - piece.start, 0, node.textContent.length);
        const endOffset = clamp(matchEnd - piece.start, 0, node.textContent.length);
        if (endOffset <= startOffset) return;

        const range = document.createRange();
        range.setStart(node, startOffset);
        range.setEnd(node, endOffset);

        Array.from(range.getClientRects()).forEach((rect) => {
          if (rect.width <= 0 || rect.height <= 0) return;
          const left = clamp(rect.left - overlayRect.left, 0, overlayRect.width);
          const right = clamp(rect.right - overlayRect.left, 0, overlayRect.width);
          const top = clamp(rect.top - overlayRect.top, 0, overlayRect.height);
          const bottom = clamp(rect.bottom - overlayRect.top, 0, overlayRect.height);
          if (right <= left || bottom <= top) return;
          const mark = document.createElement("span");
          mark.className = `pdf-user-mark color-${annotation.color}`;
          mark.style.left = `${left}px`;
          mark.style.top = `${top}px`;
          mark.style.width = `${right - left}px`;
          mark.style.height = `${bottom - top}px`;
          highlightLayerElement.appendChild(mark);
          marks.push(mark);
        });

        range.detach();
      });
    });
  });

  return () => {
    window.cancelAnimationFrame(frame);
    marks.forEach((mark) => mark.remove());
  };
}

function installSelectionSmoother(selectionLayerElement: HTMLDivElement, textLayerElement: HTMLDivElement) {
  let fills: HTMLSpanElement[] = [];
  let frame: number | null = null;

  function clearFills() {
    fills.forEach((fill) => fill.remove());
    fills = [];
  }

  function drawSelectionFills() {
    frame = null;
    clearFills();

    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !textLayerElement.isConnected ||
      !selectionLayerElement.isConnected
    ) {
      return;
    }

    const textLayerRect = textLayerElement.getBoundingClientRect();
    const overlayRect = selectionLayerElement.getBoundingClientRect();
    const lines: { left: number; right: number; topSum: number; count: number; maxHeight: number }[] = [];

    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      Array.from(range.getClientRects()).forEach((rect) => {
        const overlapsLayer =
          rect.width > 1 &&
          rect.height > 2 &&
          rect.right >= textLayerRect.left &&
          rect.left <= textLayerRect.right &&
          rect.bottom >= textLayerRect.top &&
          rect.top <= textLayerRect.bottom;
        if (!overlapsLayer) return;

        const line = lines.find((candidate) => Math.abs(candidate.topSum / candidate.count - rect.top) < 3);

        if (line) {
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          line.topSum += rect.top;
          line.count += 1;
          line.maxHeight = Math.max(line.maxHeight, rect.height);
        } else {
          lines.push({
            left: rect.left,
            right: rect.right,
            topSum: rect.top,
            count: 1,
            maxHeight: rect.height,
          });
        }
      });
    }

    lines
      .filter((line) => line.right - line.left > 1 && line.maxHeight > 2)
      .sort((first, second) => first.topSum / first.count - second.topSum / second.count)
      .forEach((line) => {
        const top = line.topSum / line.count;
        const left = clamp(line.left - overlayRect.left, 0, overlayRect.width);
        const right = clamp(line.right - overlayRect.left, 0, overlayRect.width);
        const bottom = clamp(top + line.maxHeight - overlayRect.top, 0, overlayRect.height);
        const normalizedTop = clamp(top - overlayRect.top, 0, overlayRect.height);
        if (right <= left || bottom <= normalizedTop) return;

        const fill = document.createElement("span");
        fill.className = "pdf-selection-fill";
        fill.style.left = `${left}px`;
        fill.style.top = `${normalizedTop}px`;
        fill.style.width = `${right - left}px`;
        fill.style.height = `${bottom - normalizedTop}px`;
        selectionLayerElement.appendChild(fill);
        fills.push(fill);
      });
  }

  function scheduleDraw() {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(drawSelectionFills);
  }

  document.addEventListener("selectionchange", scheduleDraw);
  textLayerElement.addEventListener("mouseup", scheduleDraw);
  textLayerElement.addEventListener("keyup", scheduleDraw);
  textLayerElement.addEventListener("touchend", scheduleDraw);

  return () => {
    document.removeEventListener("selectionchange", scheduleDraw);
    textLayerElement.removeEventListener("mouseup", scheduleDraw);
    textLayerElement.removeEventListener("keyup", scheduleDraw);
    textLayerElement.removeEventListener("touchend", scheduleDraw);
    if (frame !== null) window.cancelAnimationFrame(frame);
    clearFills();
  };
}

function elementFromSelection(selection: Selection) {
  if (selection.rangeCount === 0) return null;
  const node = selection.getRangeAt(0).commonAncestorContainer;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function pdfSelectionFromDocument(pageCount: number): ReaderSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const text = selection.toString().replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!text) return null;

  const element = elementFromSelection(selection);
  const pageShell = element?.closest<HTMLElement>("[data-pdf-page]");
  if (!pageShell || !element?.closest(".pdf-text-layer")) return null;

  const page = Number(pageShell.dataset.pdfPage);
  if (!Number.isFinite(page) || page < 1) return null;

  const safePage = clamp(Math.round(page), 1, Math.max(1, pageCount));
  const progress = pageCount <= 1 ? 1 : (safePage - 1) / (pageCount - 1);

  return {
    text,
    locator: { type: "pdf-page", page: safePage },
    progress,
    label: `Page ${safePage} of ${pageCount}`,
  };
}

function PdfPageView({
  pdf,
  pageNumber,
  scale,
  searchQuery,
  annotations,
  outlineTargets,
  observeVisibility,
  onVisible,
  onNavigatePage,
  onNavigateDestination,
  onPageError,
}: PdfPageViewProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const highlightLayerRef = useRef<HTMLDivElement | null>(null);
  const selectionLayerRef = useRef<HTMLDivElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const annotationLayerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onVisibleRef = useRef(onVisible);
  const onNavigatePageRef = useRef(onNavigatePage);
  const onNavigateDestinationRef = useRef(onNavigateDestination);
  const onPageErrorRef = useRef(onPageError);

  useEffect(() => {
    onVisibleRef.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    onNavigatePageRef.current = onNavigatePage;
  }, [onNavigatePage]);

  useEffect(() => {
    onNavigateDestinationRef.current = onNavigateDestination;
  }, [onNavigateDestination]);

  useEffect(() => {
    onPageErrorRef.current = onPageError;
  }, [onPageError]);

  useEffect(() => {
    if (!observeVisibility || !shellRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio > 0.45) {
          onVisibleRef.current(pageNumber);
        }
      },
      { threshold: [0.45, 0.7] },
    );

    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, [observeVisibility, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let textLayer: TextLayer | null = null;
    let removeOutlineTextLinks: (() => void) | null = null;
    let removeSearchHighlights: (() => void) | null = null;
    let removeUserHighlights: (() => void) | null = null;
    let removeSelectionSmoother: (() => void) | null = null;

    async function renderPage() {
      try {
        const canvas = canvasRef.current;
        const highlightLayerElement = highlightLayerRef.current;
        const selectionLayerElement = selectionLayerRef.current;
        const textLayerElement = textLayerRef.current;
        const annotationLayerElement = annotationLayerRef.current;
        if (!canvas || !highlightLayerElement || !selectionLayerElement || !textLayerElement || !annotationLayerElement) return;

        const page: PDFPageProxy = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const outputScale = Math.max(1, window.devicePixelRatio || 1);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;

        const nextSize = {
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
        };
        setSize((current) => (current.width === nextSize.width && current.height === nextSize.height ? current : nextSize));
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });

        await renderTask.promise;
        if (cancelled) return;

        textLayerElement.innerHTML = "";
        highlightLayerElement.innerHTML = "";
        selectionLayerElement.innerHTML = "";
        annotationLayerElement.innerHTML = "";
        const textContent = await page.getTextContent();
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerElement,
          viewport,
        });
        await textLayer.render();
        removeSelectionSmoother = installSelectionSmoother(selectionLayerElement, textLayerElement);

        removeSearchHighlights = installSearchHighlights(
          highlightLayerElement,
          textLayerElement,
          textLayer.textDivs as HTMLElement[],
          textLayer.textContentItemsStr,
          searchQuery,
        );

        removeUserHighlights = installUserAnnotationHighlights(
          highlightLayerElement,
          textLayerElement,
          textLayer.textDivs as HTMLElement[],
          textLayer.textContentItemsStr,
          annotations,
        );

        removeOutlineTextLinks = installOutlineTextLinks(
          textLayerElement,
          textLayer.textDivs as HTMLElement[],
          textLayer.textContentItemsStr,
          outlineTargets,
          (page) => onNavigatePageRef.current(page),
        );

        const pdfAnnotations = await page.getAnnotations({ intent: "display" }).catch(() => []);
        if (cancelled || pdfAnnotations.length === 0) return;

        const linkService = createLinkService((destination) => onNavigateDestinationRef.current(destination));
        const annotationLayer = new AnnotationLayer({
          div: annotationLayerElement,
          page,
          viewport,
          linkService,
          annotationStorage: null,
          accessibilityManager: null,
          annotationCanvasMap: null,
          annotationEditorUIManager: null,
          structTreeLayer: null,
          commentManager: null,
        } as never);

        await annotationLayer.render({
          viewport,
          div: annotationLayerElement,
          annotations: pdfAnnotations,
          page,
          linkService: linkService as never,
          renderForms: false,
        });
        expandNarrowAnnotationLinks(annotationLayerElement, pdfAnnotations, viewport);
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          onPageErrorRef.current("A PDF page could not be rendered.");
          if (process.env.NODE_ENV !== "production") {
            console.error("[pdf-page]", error);
          }
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      removeOutlineTextLinks?.();
      removeSearchHighlights?.();
      removeUserHighlights?.();
      removeSelectionSmoother?.();
    };
  }, [annotations, outlineTargets, pageNumber, pdf, scale, searchQuery]);

  return (
    <div ref={shellRef} className="pdf-page-shell" id={`pdf-page-${pageNumber}`} data-pdf-page={pageNumber}>
      <div className="pdf-page-inner" style={{ width: size.width || undefined, height: size.height || undefined }}>
        <canvas ref={canvasRef} className="pdf-canvas" aria-label={`Page ${pageNumber}`} />
        <div ref={highlightLayerRef} className="pdf-highlight-layer" aria-hidden="true" />
        <div ref={selectionLayerRef} className="pdf-selection-layer" aria-hidden="true" />
        <div ref={textLayerRef} className="textLayer pdf-text-layer" />
        <div ref={annotationLayerRef} className="annotationLayer pdf-annotation-layer" />
      </div>
      <span className="muted small">Page {pageNumber}</span>
    </div>
  );
}

export function PdfReader({
  fileUrl,
  state,
  annotations,
  command,
  searchQuery,
  onTocChange,
  onSearchResults,
  onSearchStatus,
  onLocationChange,
  onSelectionChange,
  onReadableTextChange,
  onError,
  onLoadStatus,
}: ReaderEngineProps) {
  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(612);
  const [pageHeight, setPageHeight] = useState(792);
  const [currentPage, setCurrentPage] = useState(state.pdfPage ?? 1);
  const [renderZoom, setRenderZoom] = useState(state.zoom);
  const [outlineTargets, setOutlineTargets] = useState<OutlineTarget[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loadMessage, setLoadMessage] = useState("Loading PDF");
  const [retryKey, setRetryKey] = useState(0);
  const handledCommand = useRef(0);
  const initialPage = useRef(state.pdfPage ?? 1);
  const pendingScrollPage = useRef<number | null>(state.pdfPage ?? 1);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const numPagesRef = useRef(0);
  const currentPageRef = useRef(state.pdfPage ?? 1);
  const statePdfPageRef = useRef(state.pdfPage ?? 1);
  const layoutRef = useRef(state.layout);
  const explicitNavigationPageRef = useRef<number | null>(null);
  const restoreVisibilityLockRef = useRef(false);
  const restoreTimerRef = useRef<number | null>(null);
  const navigationLockTimerRef = useRef<number | null>(null);
  const lastViewSignatureRef = useRef("");
  const lastNotifiedLocationRef = useRef("");
  const lastPublishedSearchRef = useRef("");
  const lastPublishedSearchStatusRef = useRef("");
  const searchRunRef = useRef(0);
  const textCacheRef = useRef<Map<number, CachedPageText>>(new Map());
  const textPromiseCacheRef = useRef<Map<number, Promise<CachedPageText>>>(new Map());
  const onTocChangeRef = useRef(onTocChange);
  const onSearchResultsRef = useRef(onSearchResults);
  const onSearchStatusRef = useRef(onSearchStatus);
  const onLocationChangeRef = useRef(onLocationChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onReadableTextChangeRef = useRef(onReadableTextChange);
  const onErrorRef = useRef(onError);
  const onLoadStatusRef = useRef(onLoadStatus);

  useEffect(() => {
    onTocChangeRef.current = onTocChange;
  }, [onTocChange]);

  useEffect(() => {
    onSearchResultsRef.current = onSearchResults;
  }, [onSearchResults]);

  useEffect(() => {
    onSearchStatusRef.current = onSearchStatus;
  }, [onSearchStatus]);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onReadableTextChangeRef.current = onReadableTextChange;
  }, [onReadableTextChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onLoadStatusRef.current = onLoadStatus;
  }, [onLoadStatus]);

  useEffect(() => {
    pdfRef.current = pdf;
  }, [pdf]);

  useEffect(() => {
    numPagesRef.current = numPages;
  }, [numPages]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    statePdfPageRef.current = state.pdfPage ?? 1;
  }, [state.pdfPage]);

  useEffect(() => {
    layoutRef.current = state.layout;
  }, [state.layout]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRenderZoom((current) => (current === state.zoom ? current : state.zoom));
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [state.zoom]);

  const dualPage = state.dualPage && state.layout === "paginated" && containerWidth > 960;
  const scale = useMemo(() => {
    const zoom = renderZoom / 100;
    if (state.fitWidth) {
      const spreadGap = dualPage ? 18 : 0;
      const availableWidth = Math.max(320, containerWidth - 8);
      const spreadWidth = (dualPage ? pageWidth * 2 : pageWidth) + spreadGap;
      return clamp((availableWidth / spreadWidth) * zoom, 0.45, 3);
    }
    return clamp(zoom, 0.5, 3);
  }, [containerWidth, dualPage, pageWidth, renderZoom, state.fitWidth]);

  const estimatedVerticalStride = useMemo(() => Math.max(120, Math.round(pageHeight * scale) + 32), [pageHeight, scale]);

  const releaseNavigationLock = useCallback((delay: number) => {
    if (navigationLockTimerRef.current) {
      window.clearTimeout(navigationLockTimerRef.current);
    }

    navigationLockTimerRef.current = window.setTimeout(() => {
      explicitNavigationPageRef.current = null;
      restoreVisibilityLockRef.current = false;
      navigationLockTimerRef.current = null;
    }, delay);
  }, []);

  const goToPage = useCallback(
    (page: number, scroll = true) => {
      const pageCount = numPagesRef.current;
      if (!pageCount) return;
      const next = clamp(page, 1, pageCount);
      explicitNavigationPageRef.current = next;
      restoreVisibilityLockRef.current = true;
      if (scroll) pendingScrollPage.current = next;
      setCurrentPage((current) => (current === next ? current : next));
      releaseNavigationLock(layoutRef.current === "vertical" ? 900 : 560);
    },
    [releaseNavigationLock],
  );

  const handleDestination = useCallback(
    async (destination: unknown) => {
      const currentPdf = pdfRef.current;
      if (!currentPdf) return;
      const page = await destinationToPage(currentPdf, destination).catch(() => null);
      if (page) goToPage(page);
    },
    [goToPage],
  );

  const handleVisiblePage = useCallback((nextPage: number) => {
    if (restoreVisibilityLockRef.current) return;
    setCurrentPage((current) => (current === nextPage ? current : nextPage));
  }, []);

  const handleViewerScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (state.layout !== "vertical" || restoreVisibilityLockRef.current || !numPagesRef.current) return;
      const nextPage = clamp(Math.floor(event.currentTarget.scrollTop / estimatedVerticalStride) + 1, 1, numPagesRef.current);
      setCurrentPage((current) => (current === nextPage ? current : nextPage));
    },
    [estimatedVerticalStride, state.layout],
  );

  const handlePageError = useCallback((message: string) => {
    setLoadError((current) => (current === message ? current : message));
    onErrorRef.current(message);
    onLoadStatusRef.current({ phase: "error", message });
    const currentPdf = pdfRef.current;
    if (currentPdf) {
      void currentPdf.destroy().catch(() => undefined);
    }
  }, []);

  const publishSearchResults = useCallback((runId: number, results: SearchResult[]) => {
    if (runId !== searchRunRef.current) return;
    const snapshot = results.map((result) => result.id).join("|");
    if (lastPublishedSearchRef.current === snapshot) return;
    lastPublishedSearchRef.current = snapshot;
    onSearchResultsRef.current(results);
  }, []);

  const publishSearchStatus = useCallback((runId: number, status: ReaderSearchStatus) => {
    if (runId !== searchRunRef.current) return;
    const snapshot = JSON.stringify(status);
    if (lastPublishedSearchStatusRef.current === snapshot) return;
    lastPublishedSearchStatusRef.current = snapshot;
    onSearchStatusRef.current(status);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError((current) => (current === "" ? current : ""));
    setLoadMessage("Loading PDF");
    setPdf((current) => (current === null ? current : null));
    setNumPages((current) => (current === 0 ? current : 0));
    setOutlineTargets((current) => (current.length === 0 ? current : []));
    initialPage.current = statePdfPageRef.current;
    pendingScrollPage.current = statePdfPageRef.current;
    lastNotifiedLocationRef.current = "";
    lastPublishedSearchRef.current = "";
    lastPublishedSearchStatusRef.current = "";
    searchRunRef.current += 1;
    textCacheRef.current.clear();
    textPromiseCacheRef.current.clear();
    onErrorRef.current("");
    onLoadStatusRef.current({ phase: "fetching", message: "Fetching PDF file" });
    onSearchResultsRef.current([]);
    onSearchStatusRef.current({ state: "idle", query: "" });
    onTocChangeRef.current([]);
    onSelectionChangeRef.current(null);
    onReadableTextChangeRef.current(null);

    const loadingTask = getDocument({
      url: fileUrl,
      disableAutoFetch: false,
      disableRange: false,
      disableStream: false,
    });

    async function loadPdf() {
      try {
        if (process.env.NODE_ENV !== "production") {
          console.info("[pdf-reader] loading", fileUrl);
        }
        setLoadMessage("Fetching PDF file");
        const loadedPdf = await withTimeout(loadingTask.promise, "PDF load", PDF_LOAD_TIMEOUT_MS);
        if (cancelled) return;

        setLoadMessage("Parsing PDF");
        onLoadStatusRef.current({ phase: "parsing", message: "Parsing PDF" });
        if (loadedPdf.numPages <= 0) {
          throw new Error("PDF loaded without any pages.");
        }

        setPdf(loadedPdf);
        setNumPages((current) => (current === loadedPdf.numPages ? current : loadedPdf.numPages));
        setLoadMessage("Preparing PDF pages");
        onLoadStatusRef.current({ phase: "rendering", message: "Preparing PDF pages" });
        const firstPage = await loadedPdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1 });
        const nextPageWidth = Math.round(viewport.width);
        const nextPageHeight = Math.round(viewport.height);
        setPageWidth((current) => (current === nextPageWidth ? current : nextPageWidth));
        setPageHeight((current) => (current === nextPageHeight ? current : nextPageHeight));

        const outline = await loadedPdf.getOutline().catch(() => null);
        const outlineItems = await flattenOutline(loadedPdf, outline);
        setOutlineTargets(
          outlineItems.flatMap((item) =>
            item.locator.type === "pdf-page"
              ? [
                  {
                    id: item.id,
                    label: item.label,
                    page: item.locator.page,
                  },
                ]
              : [],
          ),
        );
        onTocChangeRef.current(outlineItems);

        const startingPage = clamp(initialPage.current, 1, loadedPdf.numPages);
        pendingScrollPage.current = startingPage;
        setCurrentPage((current) => (current === startingPage ? current : startingPage));
        onLoadStatusRef.current({ phase: "ready", message: "PDF ready" });
      } catch (error) {
        if (cancelled) return;
        const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
        const message = `This PDF could not be loaded. The file may be missing, blocked, or invalid.${detail}`;
        setLoadError((current) => (current === message ? current : message));
        onErrorRef.current(message);
        onLoadStatusRef.current({ phase: "error", message });
        void loadingTask.destroy().catch(() => undefined);
        if (process.env.NODE_ENV !== "production") {
          console.error("[pdf-reader] load failed", error);
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => undefined);
    };
  }, [fileUrl, retryKey]);

  useLayoutEffect(() => {
    if (!numPages) return undefined;

    const signature = `${state.layout}:${dualPage}:${state.fitWidth}:${scale.toFixed(4)}:${containerWidth}`;
    if (!lastViewSignatureRef.current) {
      lastViewSignatureRef.current = signature;
      return undefined;
    }
    if (lastViewSignatureRef.current === signature) return undefined;

    lastViewSignatureRef.current = signature;
    const explicitTargetPage = explicitNavigationPageRef.current;
    const targetPage = clamp(explicitTargetPage ?? currentPageRef.current, 1, numPages);
    restoreVisibilityLockRef.current = true;
    pendingScrollPage.current = targetPage;
    setCurrentPage((current) => (current === targetPage ? current : targetPage));

    if (restoreTimerRef.current) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }

    if (explicitTargetPage) {
      releaseNavigationLock(state.layout === "vertical" ? 900 : 560);
    } else {
      restoreTimerRef.current = window.setTimeout(() => {
        restoreVisibilityLockRef.current = false;
        restoreTimerRef.current = null;
      }, 520);
    }

    if (state.layout === "vertical") {
      window.requestAnimationFrame(() => {
        document.getElementById(`pdf-page-${targetPage}`)?.scrollIntoView({ block: "start" });
      });
    }

    return undefined;
  }, [containerWidth, dualPage, numPages, releaseNavigationLock, scale, state.fitWidth, state.layout]);

  useEffect(() => {
    return () => {
      if (restoreTimerRef.current) {
        window.clearTimeout(restoreTimerRef.current);
      }
      if (navigationLockTimerRef.current) {
        window.clearTimeout(navigationLockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!command || !numPagesRef.current || handledCommand.current === command.id) return;
    handledCommand.current = command.id;

    const step = dualPage ? 2 : 1;
    if (command.type === "next") goToPage(currentPage + step);
    if (command.type === "prev") goToPage(currentPage - step);
    if (command.type === "nextChapter" || command.type === "prevChapter") {
      const targets = outlineTargets.map((target) => target.page).filter((page) => page >= 1 && page <= numPagesRef.current).sort((first, second) => first - second);
      const targetPage =
        command.type === "nextChapter"
          ? targets.find((page) => page > currentPage) ?? numPagesRef.current
          : [...targets].reverse().find((page) => page < currentPage) ?? 1;
      goToPage(targetPage);
    }
    if (command.type === "goToProgress") {
      const targetPage = Math.round(clamp(command.progress, 0, 1) * Math.max(0, numPagesRef.current - 1)) + 1;
      goToPage(targetPage);
    }
    if (command.type === "goTo" && command.locator.type === "pdf-page") goToPage(command.locator.page);
  }, [command, currentPage, dualPage, goToPage, outlineTargets]);

  useEffect(() => {
    if (!numPages) return;

    const safePage = clamp(currentPage, 1, numPages);
    const progress = numPages <= 1 ? 1 : (safePage - 1) / (numPages - 1);
    const notificationKey = `${safePage}:${numPages}:${progress.toFixed(6)}`;
    if (lastNotifiedLocationRef.current === notificationKey) return;

    lastNotifiedLocationRef.current = notificationKey;
    onLocationChangeRef.current({
      locator: { type: "pdf-page", page: safePage },
      progress,
      label: `Page ${safePage} of ${numPages}`,
    });
  }, [currentPage, numPages]);

  useEffect(() => {
    if (!pdf || !numPages) return undefined;

    let cancelled = false;
    const safePage = clamp(currentPage, 1, numPages);
    void getCachedPageText(pdf, safePage, textCacheRef.current, textPromiseCacheRef.current).then(
      (pageText) => {
        if (cancelled) return;
        onReadableTextChangeRef.current({
          text: pageText.text.slice(0, 12000),
          locator: { type: "pdf-page", page: safePage },
          label: `Page ${safePage} of ${numPages}`,
        });
      },
      () => {
        if (!cancelled) onReadableTextChangeRef.current(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [currentPage, numPages, pdf]);

  useEffect(() => {
    if (!numPages) return undefined;

    let frame: number | null = null;
    let timer: number | null = null;
    const reportSelection = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = null;
        onSelectionChangeRef.current(pdfSelectionFromDocument(numPagesRef.current));
      });
    };
    const scheduleSelectionReport = (delay = 0) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        reportSelection();
      }, delay);
    };
    const reportSoon = () => scheduleSelectionReport(0);
    const reportAfterSelectionSettles = () => scheduleSelectionReport(120);
    const reportAfterTouchSelection = () => scheduleSelectionReport(240);

    document.addEventListener("selectionchange", reportAfterSelectionSettles);
    document.addEventListener("mouseup", reportSoon);
    document.addEventListener("keyup", reportSoon);
    document.addEventListener("touchend", reportAfterTouchSelection);
    return () => {
      document.removeEventListener("selectionchange", reportAfterSelectionSettles);
      document.removeEventListener("mouseup", reportSoon);
      document.removeEventListener("keyup", reportSoon);
      document.removeEventListener("touchend", reportAfterTouchSelection);
      if (timer !== null) window.clearTimeout(timer);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [numPages]);

  useEffect(() => {
    const page = pendingScrollPage.current;
    if (!page || state.layout !== "vertical") return;

    window.requestAnimationFrame(() => {
      document.getElementById(`pdf-page-${page}`)?.scrollIntoView({ block: "start" });
      pendingScrollPage.current = null;
    });
  }, [currentPage, state.layout]);

  useEffect(() => {
    let cancelled = false;
    const query = searchQuery.trim();
    const normalizedQuery = normalizeSearchText(query);
    const runId = searchRunRef.current + 1;
    searchRunRef.current = runId;

    async function search() {
      if (!pdf || normalizedQuery.length < 2) {
        publishSearchResults(runId, []);
        publishSearchStatus(runId, { state: "idle", query });
        return;
      }

      const results: SearchResult[] = [];
      publishSearchResults(runId, []);
      publishSearchStatus(runId, {
        state: "searching",
        query,
        searchedPages: 0,
        totalPages: pdf.numPages,
        resultCount: 0,
      });

      for (let pageStart = 1; pageStart <= pdf.numPages; pageStart += PDF_SEARCH_BATCH_SIZE) {
        const pageEnd = Math.min(pdf.numPages, pageStart + PDF_SEARCH_BATCH_SIZE - 1);

        for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
          if (cancelled || runId !== searchRunRef.current) return;

          try {
            const pageText = await getCachedPageText(pdf, pageNumber, textCacheRef.current, textPromiseCacheRef.current);
            if (pageText.normalized.includes(normalizedQuery)) {
              results.push({
                id: `pdf-${query}-${pageNumber}`,
                label: `Page ${pageNumber}`,
                excerpt: excerptFor(pageText.text, query),
                locator: { type: "pdf-page", page: pageNumber },
              });
            }
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[pdf-reader] search skipped page", pageNumber, error);
            }
          }

          if (results.length >= PDF_SEARCH_RESULT_LIMIT) {
            const limitedResults = results.slice(0, PDF_SEARCH_RESULT_LIMIT);
            publishSearchResults(runId, limitedResults);
            publishSearchStatus(runId, {
              state: "done",
              query,
              searchedPages: pageNumber,
              totalPages: pdf.numPages,
              resultCount: limitedResults.length,
              truncated: true,
            });
            return;
          }
        }

        const visibleResults = results.slice(0, PDF_SEARCH_RESULT_LIMIT);
        publishSearchResults(runId, visibleResults);
        publishSearchStatus(runId, {
          state: "searching",
          query,
          searchedPages: pageEnd,
          totalPages: pdf.numPages,
          resultCount: visibleResults.length,
        });
        await yieldToBrowser();
      }

      if (!cancelled && runId === searchRunRef.current) {
        const visibleResults = results.slice(0, PDF_SEARCH_RESULT_LIMIT);
        publishSearchResults(runId, visibleResults);
        publishSearchStatus(runId, {
          state: "done",
          query,
          searchedPages: pdf.numPages,
          totalPages: pdf.numPages,
          resultCount: visibleResults.length,
          truncated: results.length > visibleResults.length,
        });
      }
    }

    const timeout = window.setTimeout(() => void search(), PDF_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [pdf, publishSearchResults, publishSearchStatus, searchQuery]);

  const visiblePages = useMemo(() => {
    if (!numPages) return [];
    if (state.layout === "vertical") {
      const start = clamp(currentPage - PDF_VERTICAL_PAGE_WINDOW_BEFORE, 1, numPages);
      const end = clamp(currentPage + PDF_VERTICAL_PAGE_WINDOW_AFTER, 1, numPages);
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
    if (dualPage && currentPage < numPages) {
      return [currentPage, currentPage + 1];
    }
    return [currentPage];
  }, [currentPage, dualPage, numPages, state.layout]);

  const annotationsByPdfPage = useMemo(() => {
    const byPage = new Map<number, ReaderAnnotation[]>();
    annotations.forEach((annotation) => {
      if (annotation.locator.type !== "pdf-page") return;
      const items = byPage.get(annotation.locator.page) ?? [];
      items.push(annotation);
      byPage.set(annotation.locator.page, items);
    });
    return byPage;
  }, [annotations]);

  const verticalStartPage = visiblePages[0] ?? 1;
  const verticalEndPage = visiblePages[visiblePages.length - 1] ?? 1;
  const topSpacerHeight = state.layout === "vertical" ? Math.max(0, (verticalStartPage - 1) * estimatedVerticalStride) : 0;
  const bottomSpacerHeight = state.layout === "vertical" ? Math.max(0, (numPages - verticalEndPage) * estimatedVerticalStride) : 0;

  if (loadError) {
    return (
      <ReaderFailure
        title="PDF unavailable"
        message={loadError}
        downloadUrl={fileUrl}
        onRetry={() => {
          setLoadError("");
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  if (!pdf) {
    return <ReaderLoadingFrame detail={loadMessage} />;
  }

  return (
    <div ref={containerRef} className={`${state.layout === "vertical" ? "reader-viewer vertical" : "reader-viewer paginated"} page-animation-${state.pageTurnAnimation}`} onScroll={handleViewerScroll}>
      <div className={state.layout === "vertical" ? "pdf-pages" : "pdf-spread"}>
        {topSpacerHeight > 0 ? <div className="pdf-page-spacer" style={{ height: topSpacerHeight }} aria-hidden="true" /> : null}
        {visiblePages.map((page) => (
          <PdfPageView
            key={page}
            pdf={pdf}
            pageNumber={page}
            scale={scale}
            searchQuery={searchQuery}
            annotations={annotationsByPdfPage.get(page) ?? []}
            outlineTargets={outlineTargets}
            observeVisibility={state.layout === "vertical"}
            onVisible={handleVisiblePage}
            onNavigatePage={goToPage}
            onNavigateDestination={handleDestination}
            onPageError={handlePageError}
          />
        ))}
        {bottomSpacerHeight > 0 ? <div className="pdf-page-spacer" style={{ height: bottomSpacerHeight }} aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
