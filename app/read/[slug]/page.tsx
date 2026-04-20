import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShellClient } from "@/components/reader/ReaderShellClient";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { displayBookTitle } from "@/lib/bookDisplay";
import { safeGetBookBySlug, safeGetReaderBookBySlug } from "@/lib/books";
import { bookAuthorLabel, decodeRouteParam } from "@/lib/seo";

export const dynamic = "force-dynamic";

type ReaderPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ReaderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await safeGetBookBySlug(decodeRouteParam(slug));
  const book = result.ok ? result.data : null;
  const author = book ? bookAuthorLabel(book) : "";
  const title = book ? displayBookTitle(book.title) : "";

  // Reader pages are task-focused reading surfaces rather than public landing pages,
  // so public discovery should point to /books/[slug] instead.
  return {
    title: book ? `Read ${title}` : "Reader",
    description: book ? `Read ${title}${author ? ` by ${author}` : ""} in The Library.` : "Open the reader in The Library.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { slug } = await params;
  const result = await safeGetReaderBookBySlug(decodeRouteParam(slug));

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The reader could not load." />;
  }

  const book = result.data;
  if (!book) notFound();

  return <ReaderShellClient book={book} />;
}
