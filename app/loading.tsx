import { BookCardSkeleton } from "@/components/library/BookCardSkeleton";

export default function Loading() {
  return (
    <main className="site-shell library-home" id="main">
      <header className="library-header" aria-hidden="true">
        <div className="library-header-main">
          <div className="library-header-copy">
            <h1 className="site-title">The Library</h1>
            <span className="skeleton skeleton-line loading-subtitle" />
          </div>
          <div className="library-header-actions">
            <span className="skeleton skeleton-icon-button" />
            <span className="skeleton loading-search" />
          </div>
        </div>
      </header>

      <section className="toolbar library-filterbar loading-filterbar" aria-hidden="true">
        <div className="toolbar-filters">
          <span className="skeleton skeleton-control" />
          <span className="skeleton skeleton-control" />
          <span className="skeleton skeleton-control" />
          <span className="skeleton skeleton-control" />
          <span className="skeleton skeleton-count" />
        </div>
        <div className="toolbar-views">
          <span className="skeleton skeleton-segmented" />
        </div>
      </section>

      <section className="continue-section continue-section-pending" aria-hidden="true">
        <div className="section-heading">
          <h2>Continue reading</h2>
          <span className="muted small">Pick up where you left off</span>
        </div>
        <div className="continue-card-grid">
          <ContinueCardSkeleton />
          <ContinueCardSkeleton />
        </div>
      </section>

      <section className="browse-section browse-section-gallery" aria-labelledby="browse-loading-heading">
        <div className="section-heading browse-heading">
          <div>
            <h2 id="browse-loading-heading">Browse library</h2>
            <span className="skeleton skeleton-line loading-browse-copy" aria-hidden="true" />
          </div>
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

function ContinueCardSkeleton() {
  return (
    <article className="continue-card continue-card-skeleton">
      <span className="continue-cover cover-link skeleton" />
      <div className="continue-card-body">
        <span className="skeleton skeleton-line continue-kicker-skeleton" />
        <span className="skeleton skeleton-line continue-title-skeleton" />
        <span className="skeleton skeleton-line continue-author-skeleton" />
        <span className="skeleton skeleton-line continue-progress-skeleton" />
        <span className="skeleton continue-button-skeleton" />
      </div>
    </article>
  );
}
