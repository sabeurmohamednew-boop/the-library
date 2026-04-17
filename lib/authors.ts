import { slugify } from "@/lib/slug";

export function authorSlug(author: string) {
  return slugify(author);
}

export function authorPath(author: string) {
  return `/authors/${authorSlug(author)}`;
}
