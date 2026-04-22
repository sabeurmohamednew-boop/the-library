import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdminSession } from "@/lib/adminAuth";
import { authorPaths } from "@/lib/authors";
import { serializeBook } from "@/lib/books";
import { bookCreateSchema } from "@/lib/validation";
import { bookDataFromInput, coverDataFromBlob, fileDataFromBlob, safeAdminError, uniqueSlug } from "@/lib/adminBooks";
import { dateFromPublicationYear, parsePublicationDateInput, postgresPublicationDateLiteralFromYear, publicationYearFromDate } from "@/lib/publicationYear";
import { blobStoreConfigured, deleteBlobIfPresent, validateBookBlob, validateCoverBlob } from "@/lib/storage";

export const runtime = "nodejs";

function revalidateCreatePaths(book: { slug: string; author: string }) {
  for (const path of ["/", "/admin", "/admin/books", `/books/${book.slug}`, `/read/${book.slug}`, ...authorPaths(book.author)]) {
    revalidatePath(path);
  }
}

function createLog(message: string, data?: Record<string, unknown>) {
  console.info("[admin-book-create]", message, data ?? {});
}

function blobPathsFromBody(body: unknown) {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  return ["bookBlob", "coverBlob"]
    .map((key) => record[key])
    .filter((value): value is { pathname: string } => Boolean(value) && typeof value === "object" && typeof (value as { pathname?: unknown }).pathname === "string")
    .map((value) => value.pathname);
}

function bodyWithPublicationDate(body: unknown) {
  if (!body || typeof body !== "object") return { ok: true as const, body };

  const record = body as Record<string, unknown>;
  const parsed = parsePublicationDateInput(record.publicationDate);
  if (!parsed.ok) return { ok: false as const, error: parsed.error };

  return {
    ok: true as const,
    body: {
      ...record,
      publicationDate: parsed.date,
      publicationDatePrecision: parsed.precision,
    },
  };
}

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  if (!blobStoreConfigured()) {
    return NextResponse.json({ error: "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before importing books." }, { status: 503 });
  }

  const uploadedPaths: string[] = [];

  try {
    const body = await request.json();
    uploadedPaths.push(...blobPathsFromBody(body));
    const normalizedBody = bodyWithPublicationDate(body);
    if (!normalizedBody.ok) {
      await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
      return NextResponse.json({ error: normalizedBody.error, fieldErrors: { publicationDate: [normalizedBody.error] } }, { status: 400 });
    }

    const parsed = bookCreateSchema.safeParse(normalizedBody.body);

    if (!parsed.success) {
      await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid metadata.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const bookBlobError = validateBookBlob(parsed.data.bookBlob, parsed.data.format);
    if (bookBlobError) {
      await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
      return NextResponse.json({ error: bookBlobError, fieldErrors: { bookFile: [bookBlobError] } }, { status: 400 });
    }

    const coverBlobError = validateCoverBlob(parsed.data.coverBlob);
    if (coverBlobError) {
      await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
      return NextResponse.json({ error: coverBlobError, fieldErrors: { coverFile: [coverBlobError] } }, { status: 400 });
    }

    const slug = await uniqueSlug(parsed.data.title);
    const duplicateRows = await prisma.book.findMany({
      where: {
        title: parsed.data.title,
        author: parsed.data.author,
      },
      select: { id: true, slug: true, title: true, author: true },
      orderBy: [{ uploadDate: "desc" }, { title: "asc" }],
    });
    createLog("duplicate-check-before-create", {
      title: parsed.data.title,
      author: parsed.data.author,
      duplicates: duplicateRows,
    });

    const publicationYear = publicationYearFromDate(parsed.data.publicationDate);
    const bookData = bookDataFromInput(parsed.data);
    const { publicationDate, ...bookDataWithoutPublicationDate } = bookData;
    const book = await prisma.$transaction(async (tx) => {
      const created = await tx.book.create({
        data: {
          ...(publicationYear < 0 ? { ...bookDataWithoutPublicationDate, publicationDate: dateFromPublicationYear(0) } : bookData),
          ...fileDataFromBlob(parsed.data.bookBlob, parsed.data.format),
          ...coverDataFromBlob(parsed.data.coverBlob),
          slug,
          uploadDate: new Date(),
        },
      });

      if (publicationYear >= 0) return created;

      const publicationDateLiteral = postgresPublicationDateLiteralFromYear(publicationYear);
      await tx.$executeRaw`UPDATE "Book" SET "publicationDate" = ${publicationDateLiteral}::timestamp WHERE "id" = ${created.id}`;
      return {
        ...created,
        publicationDate,
        publicationDateYear: publicationYear,
      };
    });
    createLog("created-row", {
      id: book.id,
      slug: book.slug,
      title: book.title,
      author: book.author,
    });
    revalidateCreatePaths(book);

    return NextResponse.json({
      ok: true,
      book: serializeBook(book),
    });
  } catch (error) {
    await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
    return NextResponse.json({ error: safeAdminError(error, "The book could not be imported.") }, { status: 500 });
  }
}
