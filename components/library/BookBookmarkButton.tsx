"use client";

import { Bookmark } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { loadBookmarkedSlugs, setBookBookmarked } from "@/lib/clientStorage";

type BookBookmarkButtonProps = {
  slug: string;
};

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function BookBookmarkButton({ slug }: BookBookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(false);

  useClientLayoutEffect(() => {
    setBookmarked(loadBookmarkedSlugs().has(slug));
  }, [slug]);

  function toggle() {
    const next = !bookmarked;
    setBookmarked(next);
    setBookBookmarked(slug, next);
  }

  return (
    <button className={bookmarked ? "button primary" : "button"} type="button" onClick={toggle} aria-pressed={bookmarked}>
      <Bookmark size={18} aria-hidden="true" />
      <span className="button-label-stable">{bookmarked ? "Bookmarked" : "Bookmark"}</span>
    </button>
  );
}
