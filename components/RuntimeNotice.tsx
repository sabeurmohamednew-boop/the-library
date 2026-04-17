import Link from "next/link";
import type { RuntimeFailure } from "@/lib/runtime";

type RuntimeNoticeProps = {
  failure: RuntimeFailure;
  title?: string;
  adminHref?: string;
};

export function RuntimeNotice({ failure, title = "The Library is temporarily unavailable.", adminHref }: RuntimeNoticeProps) {
  return (
    <main className="site-shell" id="main">
      <div className="page-topline">
        <Link className="button subtle" href="/">
          Back to The Library
        </Link>
        {adminHref ? (
          <Link className="button" href={adminHref}>
            Admin
          </Link>
        ) : null}
      </div>
      <section className="empty-state" aria-live="polite">
        <h1>{title}</h1>
        <p>{failure.userMessage}</p>
      </section>
    </main>
  );
}
