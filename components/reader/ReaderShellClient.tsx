"use client";

import dynamic from "next/dynamic";
import { ReaderRouteLoadingShell } from "@/components/reader/ReaderLoadingState";
import type { ReaderBookDTO } from "@/lib/types";

const ClientReaderShell = dynamic(() => import("@/components/reader/ReaderShell").then((mod) => mod.ReaderShell), {
  ssr: false,
  loading: () => <ReaderRouteLoadingShell />,
});

export function ReaderShellClient({ book }: { book: ReaderBookDTO }) {
  return <ClientReaderShell book={book} />;
}
