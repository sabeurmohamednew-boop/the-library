import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetBookBySlug } from "@/lib/books";
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

  // Reader pages are task-focused reading surfaces rather than public landing pages,
  // so public discovery should point to /books/[slug] instead.
  return {
    title: book ? `Read ${book.title}` : "Reader",
    description: book ? `Read ${book.title}${author ? ` by ${author}` : ""} in The Library.` : "Open the reader in The Library.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { slug } = await params;
  const result = await safeGetBookBySlug(decodeRouteParam(slug));

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The reader could not load." />;
  }

  const book = result.data;
  if (!book) notFound();

  return <ReaderShell book={book} />;
}
