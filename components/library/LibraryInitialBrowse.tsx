import type { LibraryBookDTO } from "@/lib/types";
import { BookCard } from "@/components/library/BookCard";

type LibraryInitialBrowseProps = {
  books: LibraryBookDTO[];
};

export function LibraryInitialBrowse({ books }: LibraryInitialBrowseProps) {
  return (
    <div className="gallery-grid">
      {books.map((book, index) => (
        <BookCard key={book.slug} book={book} imagePriority={index === 0} imageFetchPriority={index === 0 ? "high" : undefined} />
      ))}
    </div>
  );
}
