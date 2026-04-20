"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { ReaderRouteLoadingShell } from "@/components/reader/ReaderLoadingState";
import type { ReaderBookDTO } from "@/lib/types";

type ClientReaderShellProps = {
  book: ReaderBookDTO;
  onShellReady: () => void;
};

const ClientReaderShell = dynamic<ClientReaderShellProps>(() => import("@/components/reader/ReaderShell").then((mod) => mod.ReaderShell), {
  ssr: false,
  loading: () => null,
});

export function ReaderShellClient({ book }: { book: ReaderBookDTO }) {
  const [shellReady, setShellReady] = useState(false);
  const handleShellReady = useCallback(() => setShellReady(true), []);

  return (
    <>
      {!shellReady ? <ReaderRouteLoadingShell book={book} /> : null}
      <ClientReaderShell book={book} onShellReady={handleShellReady} />
    </>
  );
}
