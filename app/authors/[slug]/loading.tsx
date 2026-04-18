import { BookCardSkeleton } from "@/components/library/BookCardSkeleton";

export default function Loading() {
  return (
    <main className="site-shell author-page" id="main">
      <div className="page-topline" aria-hidden="true">
        <span className="skeleton skeleton-button" />
      </div>

      <section aria-label="Loading author">
        <div className="section-heading author-page-heading author-page-heading-loading" aria-hidden="true">
          <div>
            <p className="muted small">Author</p>
            <span className="skeleton skeleton-line author-title-skeleton" />
          </div>
          <span className="skeleton skeleton-count author-count-skeleton" />
        </div>

        <div className="gallery-grid skeleton-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <BookCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
