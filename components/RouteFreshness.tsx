"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { LIBRARY_CONTENT_VERSION_KEY } from "@/lib/clientFreshness";

function routeNeedsFreshData(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/books/") ||
    pathname.startsWith("/read/") ||
    pathname.startsWith("/authors/")
  );
}

function readVersion() {
  try {
    return window.localStorage.getItem(LIBRARY_CONTENT_VERSION_KEY);
  } catch {
    return null;
  }
}

export function RouteFreshness() {
  const pathname = usePathname();
  const router = useRouter();
  const lastSeenVersionRef = useRef<string | null>(null);

  useEffect(() => {
    lastSeenVersionRef.current = readVersion();
  }, [pathname]);

  useEffect(() => {
    if (!routeNeedsFreshData(pathname)) return;

    function refreshIfContentChanged() {
      const nextVersion = readVersion();
      if (!nextVersion || nextVersion === lastSeenVersionRef.current) return;

      lastSeenVersionRef.current = nextVersion;
      router.refresh();
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh();
      } else {
        refreshIfContentChanged();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshIfContentChanged();
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === LIBRARY_CONTENT_VERSION_KEY) {
        refreshIfContentChanged();
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", refreshIfContentChanged);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", refreshIfContentChanged);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
