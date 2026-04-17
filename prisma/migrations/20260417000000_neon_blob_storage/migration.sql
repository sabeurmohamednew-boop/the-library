CREATE TABLE "Book" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "pageCount" INTEGER NOT NULL,
  "publicationDate" TIMESTAMP(3) NOT NULL,
  "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bookBlobUrl" TEXT NOT NULL,
  "bookBlobPath" TEXT NOT NULL,
  "coverBlobUrl" TEXT NOT NULL,
  "coverBlobPath" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileContentType" TEXT NOT NULL,
  "coverContentType" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Book_slug_key" ON "Book"("slug");
CREATE INDEX "Book_format_idx" ON "Book"("format");
CREATE INDEX "Book_category_idx" ON "Book"("category");
CREATE INDEX "Book_publicationDate_idx" ON "Book"("publicationDate");
CREATE INDEX "Book_uploadDate_idx" ON "Book"("uploadDate");
CREATE INDEX "Book_author_idx" ON "Book"("author");
CREATE INDEX "Book_title_idx" ON "Book"("title");
