import type { LibraryBookDTO } from "@/lib/types";

export type ViewMode = "gallery" | "list" | "cover";
export type ListMode = "titles" | "authors";
export type SortMode =
  | "title-asc"
  | "title-desc"
  | "publication-desc"
  | "publication-asc"
  | "upload-desc"
  | "upload-asc";

export type IndexedLibraryBook = LibraryBookDTO & {
  searchText: string;
  publicationTime: number;
  uploadTime: number;
};
