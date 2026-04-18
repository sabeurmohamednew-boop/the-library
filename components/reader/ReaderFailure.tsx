"use client";

type ReaderFailureProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  downloadLabel?: string;
  downloadUrl: string;
};

export function ReaderFailure({
  title = "Reader unavailable",
  message,
  retryLabel = "Retry",
  onRetry,
  downloadLabel = "Download book",
  downloadUrl,
}: ReaderFailureProps) {
  return (
    <div className="reader-viewer paginated">
      <div className="reader-failure" role="alert">
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="action-row">
          {onRetry ? (
            <button className="button primary" type="button" onClick={onRetry}>
              {retryLabel}
            </button>
          ) : null}
          <a className="button" href={`${downloadUrl}?download=1`}>
            {downloadLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
