import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { getBookBySlug } from "@/lib/books";

export const dynamic = "force-dynamic";

type ReaderPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ReaderPageProps): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookBySlug(decodeURIComponent(slug));

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
  const book = await getBookBySlug(decodeURIComponent(slug));

  if (!book) notFound();

  return <ReaderShell book={book} />;
}
