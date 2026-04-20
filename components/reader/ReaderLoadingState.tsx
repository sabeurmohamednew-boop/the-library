import Link from "next/link";
import { Bookmark, BookOpen, ChevronLeft, ChevronRight, HelpCircle, List, Maximize, Menu, Search, Settings } from "lucide-react";
import { displayAuthorLabel, displayBookTitle } from "@/lib/bookDisplay";
import type { ReaderBookDTO } from "@/lib/types";

type ReaderLoadingStateProps = {
  title?: string;
  detail?: string;
};

type ReaderLoadingShellBook = Pick<ReaderBookDTO, "title" | "author" | "format">;

export function ReaderLoadingState({ title = "Opening book...", detail = "Preparing your reader." }: ReaderLoadingStateProps) {
  return (
    <div className="reader-loading-state" role="status" aria-live="polite" aria-busy="true">
      <div className="reader-loading-page-stack" aria-hidden="true">
        <div className="reader-loading-page-sheet">
          <span className="reader-loading-line wide" />
          <span className="reader-loading-line medium" />
          <span className="reader-loading-gap" />
          <span className="reader-loading-line full" />
          <span className="reader-loading-line full" />
          <span className="reader-loading-line short" />
          <span className="reader-loading-gap" />
          <span className="reader-loading-line full" />
          <span className="reader-loading-line medium" />
        </div>
      </div>
      <div className="reader-loading-copy">
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function ReaderLoadingFrame(props: ReaderLoadingStateProps) {
  return (
    <div className="reader-viewer paginated reader-loading-viewer">
      <ReaderLoadingState {...props} />
    </div>
  );
}

export function ReaderRouteLoadingShell({ book, detail = "Restoring your place and preparing pages." }: { book?: ReaderLoadingShellBook; detail?: string }) {
  const bookTitle = book ? displayBookTitle(book.title) : "";
  const author = book ? displayAuthorLabel({ author: book.author }) : "";
  const titleLabel = bookTitle ? `${bookTitle}${author && author !== "Unknown" ? ` by ${author}` : ""}` : "";
  const frameTitle = book ? `Opening ${book.format}` : undefined;
  const frameDetail = bookTitle ? `Restoring your place in ${bookTitle}.` : detail;

  return (
    <div className="reader-page reader-loading-page">
      <header className="reader-topbar">
        <div className="reader-title-row">
          <Link className="button subtle" href="/" aria-label="Back to The Library">
            <BookOpen size={18} aria-hidden="true" />
            The Library
          </Link>
        </div>

        <div className={titleLabel ? "reader-title" : "reader-title reader-title-skeleton"} title={titleLabel || undefined} aria-hidden={titleLabel ? undefined : true}>
          {titleLabel || <span className="reader-chrome-skeleton title" />}
        </div>

        <div className="reader-actions">
          <div className="search-wrap reader-search reader-search-loading" aria-hidden="true">
            <Search aria-hidden="true" />
            <span className="reader-chrome-skeleton search" />
          </div>

          <div className="reader-actions desktop-reader-actions" aria-hidden="true">
            <button className="icon-button" type="button" disabled>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" disabled>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" disabled>
              <List size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" disabled>
              <Bookmark size={18} aria-hidden="true" />
            </button>
            <span className="button reader-share-skeleton">Share</span>
            <button className="icon-button" type="button" disabled>
              <Settings size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" disabled>
              <Maximize size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" disabled>
              <HelpCircle size={18} aria-hidden="true" />
            </button>
          </div>

          <button className="icon-button mobile-reader-menu" type="button" disabled aria-label="Reader controls loading">
            <Menu size={18} aria-hidden="true" />
          </button>

          <div className="mobile-reader-actions" aria-label="Page controls loading">
            <button className="icon-button" type="button" disabled>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" disabled>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className="reader-progress-track" aria-label="Opening book">
        <div className="reader-progress-fill reader-progress-loading" />
      </div>

      <main className="reader-main" id="main">
        <section className="reader-stage" aria-label="Reader loading">
          <ReaderLoadingFrame title={frameTitle} detail={frameDetail} />
        </section>
      </main>
    </div>
  );
}
