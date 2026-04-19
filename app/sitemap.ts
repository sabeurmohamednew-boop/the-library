import type { MetadataRoute } from "next";
import { authorSlug, bookAuthors } from "@/lib/authors";
import { prisma } from "@/lib/db";
import { absoluteUrl, SITEMAP_FALLBACK_DATE } from "@/lib/seo";

export const dynamic = "force-dynamic";

type SitemapBook = {
  slug: string;
  author: string;
  updatedAt: Date;
  uploadDate: Date;
};

function latestDate(dates: Date[]) {
  return dates.reduce<Date | null>((latest, date) => {
    if (!latest || date > latest) return date;
    return latest;
  }, null);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let books: SitemapBook[] = [];

  try {
    books = await prisma.book.findMany({
      select: {
        slug: true,
        author: true,
        updatedAt: true,
        uploadDate: true,
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    });
  } catch (error) {
    console.error("[sitemap] failed to load books", error);
  }

  const homeLastModified = latestDate(books.map((book) => book.updatedAt)) ?? SITEMAP_FALLBACK_DATE;
  const authorEntries = new Map<string, { author: string; updatedAt: Date }>();

  for (const book of books) {
    for (const author of bookAuthors({ author: book.author })) {
      const slug = authorSlug(author);
      const existing = authorEntries.get(slug);
      if (!existing || book.updatedAt > existing.updatedAt) {
        authorEntries.set(slug, { author, updatedAt: book.updatedAt });
      }
    }
  }

  return [
    {
      url: absoluteUrl("/"),
      lastModified: homeLastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...books.map((book) => ({
      url: absoluteUrl(`/books/${book.slug}`),
      lastModified: book.updatedAt ?? book.uploadDate ?? SITEMAP_FALLBACK_DATE,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...Array.from(authorEntries.entries())
      .sort(([firstSlug], [secondSlug]) => firstSlug.localeCompare(secondSlug))
      .map(([slug, entry]) => ({
        url: absoluteUrl(`/authors/${slug}`),
        lastModified: entry.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
  ];
}
