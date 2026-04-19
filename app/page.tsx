import type { Metadata } from "next";
import { LibraryClient } from "@/components/library/LibraryClient";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetAllBooks } from "@/lib/books";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: SITE_TITLE,
  },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default async function HomePage() {
  const result = await safeGetAllBooks();

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The Library could not load." adminHref="/admin" />;
  }

  return <LibraryClient books={result.data} />;
}
