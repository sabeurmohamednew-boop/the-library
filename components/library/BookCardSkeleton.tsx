type BookCardSkeletonProps = {
  actionCount?: 0 | 2;
};

export function BookCardSkeleton({ actionCount = 2 }: BookCardSkeletonProps) {
  return (
    <div className="book-card book-card-skeleton" aria-hidden="true">
      <div className="cover-link skeleton" />
      <div className="book-card-body">
        <span className="skeleton skeleton-line skeleton-line-title" />
        <span className="skeleton skeleton-line skeleton-line-description" />
        <span className="skeleton skeleton-line skeleton-line-author" />
        <span className="skeleton skeleton-line skeleton-line-meta" />
        {actionCount > 0 ? (
          <span className="skeleton-actions">
            <span className="skeleton skeleton-action" />
            <span className="skeleton skeleton-action" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
