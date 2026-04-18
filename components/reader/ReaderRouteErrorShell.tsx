import Link from "next/link";
import { BookOpen } from "lucide-react";
import { ReaderFailure } from "@/components/reader/ReaderFailure";

type ReaderRouteErrorShellProps = {
  downloadUrl: string;
  onRetry: () => void;
};

export function ReaderRouteErrorShell({ downloadUrl, onRetry }: ReaderRouteErrorShellProps) {
  return (
    <div className="reader-page">
      <header className="reader-topbar">
        <div className="reader-title-row">
          <Link className="button subtle" href="/" aria-label="Back to The Library">
            <BookOpen size={18} aria-hidden="true" />
            The Library
          </Link>
        </div>

        <div className="reader-title">Reader</div>
        <div className="reader-actions" />
      </header>

      <div className="reader-progress-track" aria-hidden="true">
        <div className="reader-progress-fill" />
      </div>

      <main className="reader-main" id="main">
        <section className="reader-stage" aria-label="Reader error">
          <ReaderFailure
            title="The reader could not open this book"
            message="Something interrupted the reader before the book could be displayed. Try again, or download the file directly."
            retryLabel="Retry"
            downloadLabel="Download book"
            downloadUrl={downloadUrl}
            onRetry={onRetry}
          />
        </section>
      </main>
    </div>
  );
}
