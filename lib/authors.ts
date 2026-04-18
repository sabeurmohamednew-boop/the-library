import { slugify } from "@/lib/slug";

export type AuthorSource = {
  author: string;
  authors?: string[];
};

export function normalizeAuthorName(author: string) {
  return author.replace(/\s+/g, " ").trim();
}

function authorKey(author: string) {
  return normalizeAuthorName(author).toLowerCase();
}

function dedupeAuthors(authors: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const author of authors) {
    const name = normalizeAuthorName(author);
    if (!name) continue;

    const key = authorKey(name);
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(name);
  }

  return normalized;
}

export function parseAuthors(author: string) {
  return dedupeAuthors(author.split(","));
}

export function normalizeAuthorsForStorage(author: string) {
  return parseAuthors(author).join(", ");
}

export function bookAuthors(book: AuthorSource) {
  if (book.authors?.length) {
    return dedupeAuthors(book.authors);
  }

  return parseAuthors(book.author);
}

export function authorSlug(author: string) {
  return slugify(normalizeAuthorName(author));
}

export function authorPath(author: string) {
  return `/authors/${authorSlug(author)}`;
}

export function authorPaths(author: string) {
  return parseAuthors(author).map(authorPath);
}

export function matchingAuthorForSlug(book: AuthorSource, slug: string) {
  const normalizedSlug = authorSlug(slug);
  return bookAuthors(book).find((author) => authorSlug(author) === normalizedSlug);
}

export function bookHasAuthorSlug(book: AuthorSource, slug: string) {
  return Boolean(matchingAuthorForSlug(book, slug));
}

export function buildAuthorRows<T extends AuthorSource>(books: T[]) {
  const counts = new Map<string, { author: string; count: number }>();

  for (const book of books) {
    for (const author of bookAuthors(book)) {
      const slug = authorSlug(author);
      const existing = counts.get(slug);

      counts.set(slug, {
        author: existing?.author ?? author,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }

  return Array.from(counts.values()).sort((a, b) => a.author.localeCompare(b.author));
}
