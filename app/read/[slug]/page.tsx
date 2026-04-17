import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { RuntimeNotice } from "@/components/RuntimeNotice";
import { safeGetBookBySlug } from "@/lib/books";

export const dynamic = "force-dynamic";

type ReaderPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ReaderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await safeGetBookBySlug(decodeURIComponent(slug));
  const book = result.ok ? result.data : null;

  return {
    title: book ? `Read ${book.title}` : "Reader",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function ReaderPage({ params }: ReaderPageProps) {
  const { slug } = await params;
  const result = await safeGetBookBySlug(decodeURIComponent(slug));

  if (!result.ok) {
    return <RuntimeNotice failure={result.error} title="The reader could not load." />;
  }

  const book = result.data;
  if (!book) notFound();

  return <ReaderShell book={book} />;
}
