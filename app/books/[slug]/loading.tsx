import { BookCardSkeleton } from "@/components/library/BookCardSkeleton";

export default function Loading() {
  return (
    <main className="site-shell book-detail-page" id="main">
      <div className="page-topline" aria-hidden="true">
        <span className="skeleton skeleton-button" />
      </div>

      <section className="details-grid details-grid-loading" aria-label="Loading book">
        <div className="details-cover cover-frame skeleton" aria-hidden="true" />

        <div className="details-content" aria-hidden="true">
          <div className="detail-heading-loading">
            <span className="skeleton skeleton-line detail-format-skeleton" />
            <span className="skeleton skeleton-line detail-title-skeleton" />
            <span className="skeleton skeleton-line detail-author-skeleton" />
          </div>

          <span className="skeleton skeleton-block detail-description-skeleton" />

          <div className="action-row">
            <span className="skeleton skeleton-button" />
            <span className="skeleton skeleton-button" />
            <span className="skeleton skeleton-button" />
            <span className="skeleton skeleton-button" />
          </div>

          <div className="metadata-grid metadata-grid-loading">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="metadata-item metadata-item-skeleton">
                <span className="skeleton skeleton-line metadata-label-skeleton" />
                <span className="skeleton skeleton-line metadata-value-skeleton" />
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="related-loading-section" aria-hidden="true">
        <div className="section-heading">
          <h2>Related books</h2>
        </div>
        <div className="gallery-grid skeleton-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <BookCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
