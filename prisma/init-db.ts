import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Book" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "slug" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "author" TEXT NOT NULL,
      "format" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "pageCount" INTEGER NOT NULL,
      "publicationDate" DATETIME NOT NULL,
      "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "coverImagePath" TEXT NOT NULL,
      "filePath" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "searchText" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Book_slug_key" ON "Book"("slug");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_format_idx" ON "Book"("format");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_category_idx" ON "Book"("category");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_publicationDate_idx" ON "Book"("publicationDate");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_uploadDate_idx" ON "Book"("uploadDate");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_author_idx" ON "Book"("author");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_title_idx" ON "Book"("title");`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
