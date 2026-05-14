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
          </div>
        </div>
      </header>

      <section className="browse-section browse-section-gallery" aria-labelledby="browse-loading-heading">
        <div className="section-heading browse-heading">
          <div>
            <h2 id="browse-loading-heading">Browse library</h2>
            <span className="skeleton skeleton-line loading-browse-copy" aria-hidden="true" />
          </div>
          <span className="skeleton loading-browse-action" aria-hidden="true" />
        </div>
        <div className="gallery-grid skeleton-grid">
          {Array.from({ length: 12 }).map((_, index) => (
            <BookCardSkeleton key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
