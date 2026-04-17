export default function Loading() {
  return (
    <main className="site-shell" id="main">
      <div className="page-topline">
        <h1 className="site-title">The Library</h1>
        <span className="muted small">Loading books</span>
      </div>
      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="book-card">
            <div className="skeleton" style={{ aspectRatio: "2 / 3" }} />
            <div className="book-card-body">
              <div className="skeleton" style={{ height: 18 }} />
              <div className="skeleton" style={{ height: 54 }} />
              <div className="skeleton" style={{ height: 40 }} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
