import { LIBRARY_PAGE_SIZE } from "@/lib/config";
import type { IndexedLibraryBook } from "@/components/library/libraryViewTypes";
import { BookCard } from "@/components/library/BookCard";

type LibraryInitialBrowseProps = {
  books: IndexedLibraryBook[];
};

export function LibraryInitialBrowse({ books }: LibraryInitialBrowseProps) {
  return (
    <div className="gallery-grid">
      {books.slice(0, LIBRARY_PAGE_SIZE.gallery).map((book, index) => (
        <BookCard key={book.slug} book={book} imagePriority={index < 2} />
      ))}
    </div>
  );
}
