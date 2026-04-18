"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ReaderRouteErrorShell } from "@/components/reader/ReaderRouteErrorShell";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const downloadUrl = slug ? `/api/books/${encodeURIComponent(slug)}/file` : "/api/books/missing/file";

  useEffect(() => {
    console.error("[reader-route-boundary]", error);
  }, [error]);

  return <ReaderRouteErrorShell downloadUrl={downloadUrl} onRetry={reset} />;
}
