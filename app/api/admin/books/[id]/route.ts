import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/adminAuth";
import { authorPaths } from "@/lib/authors";
import {
  bookDataFromInput,
  coverDataFromBlob,
  fileDataFromBlob,
  safeAdminError,
  validateReplacementFormat,
} from "@/lib/adminBooks";
import { publicationYearForBookId, serializeBook, withPublicationYears } from "@/lib/books";
import { prisma } from "@/lib/db";
import { parsePublicationDateInput, postgresPublicationDateLiteralFromYear, publicationYearFromDate } from "@/lib/publicationYear";
import { blobStoreConfigured, deleteBlobIfPresent, validateCoverBlob } from "@/lib/storage";
import { bookUpdateSchema } from "@/lib/validation";
import type { BookUpdateInput } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

function editLog(message: string, data?: Record<string, unknown>) {
  console.info("[admin-book-edit]", message, data ?? {});
}

function payloadSummary(body: unknown) {
  if (!body || typeof body !== "object") return { type: typeof body };
  const record = body as Record<string, unknown>;
  return {
    keys: Object.keys(record),
    title: typeof record.title === "string" ? record.title : undefined,
    author: typeof record.author === "string" ? record.author : undefined,
    format: record.format,
    category: record.category,
    pageCount: record.pageCount,
    publicationDate: record.publicationDate,
    hasBookBlob: Boolean(record.bookBlob),
    hasCoverBlob: Boolean(record.coverBlob),
  };
}

function updateSummary(input: BookUpdateInput) {
  return {
    title: input.title,
    author: input.author,
    format: input.format,
    category: input.category,
    pageCount: input.pageCount,
    publicationDate: input.publicationDate.toISOString(),
    publicationDatePrecision: input.publicationDatePrecision,
    hasBookBlob: Boolean(input.bookBlob),
    hasCoverBlob: Boolean(input.coverBlob),
  };
}

function rowSummary(book: {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  format: string;
  category: string;
  pageCount: number;
  publicationDate: Date;
  publicationDatePrecision?: string | null;
  updatedAt: Date;
  publicationDateYear?: number | null;
}) {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    descriptionLength: book.description.length,
    author: book.author,
    format: book.format,
    category: book.category,
    pageCount: book.pageCount,
    publicationDate: Number.isNaN(book.publicationDate.getTime())
      ? typeof book.publicationDateYear === "number"
        ? `year ${book.publicationDateYear}`
        : "Invalid Date"
      : book.publicationDate.toISOString(),
    publicationDatePrecision: book.publicationDatePrecision,
    updatedAt: book.updatedAt.toISOString(),
  };
}

function metadataPersisted(
  book: {
    title: string;
    description: string;
    author: string;
    format: string;
    category: string;
    pageCount: number;
    publicationDate: Date;
    publicationDatePrecision?: string | null;
    bookBlobUrl: string;
    bookBlobPath: string;
    fileSize: number;
    coverBlobUrl: string;
    coverBlobPath: string;
    coverContentType: string;
  },
  input: BookUpdateInput,
  publicationDateYear?: number | null,
) {
  const publicationDateMatches =
    Number.isNaN(book.publicationDate.getTime())
      ? publicationDateYear === publicationYearFromDate(input.publicationDate)
      : book.publicationDate.getTime() === input.publicationDate.getTime();

  const metadataMatches =
    book.title === input.title &&
    book.description === input.description &&
    book.author === input.author &&
    book.format === input.format &&
    book.category === input.category &&
    book.pageCount === input.pageCount &&
    publicationDateMatches &&
    (book.publicationDatePrecision ?? "YEAR") === input.publicationDatePrecision;

  const bookBlobMatches =
    !input.bookBlob || (book.bookBlobUrl === input.bookBlob.url && book.bookBlobPath === input.bookBlob.pathname && book.fileSize === input.bookBlob.size);

  const coverBlobMatches =
    !input.coverBlob ||
    (book.coverBlobUrl === input.coverBlob.url &&
      book.coverBlobPath === input.coverBlob.pathname &&
      book.coverContentType === input.coverBlob.contentType);

  return metadataMatches && bookBlobMatches && coverBlobMatches;
}

function revalidateBookPaths(book: { id: string; slug: string; author: string }, previous: { slug: string; author: string }) {
  const paths = [
    "/",
    "/admin",
    "/admin/books",
    `/admin/books/${book.id}/edit`,
    `/books/${previous.slug}`,
    `/books/${book.slug}`,
    `/read/${previous.slug}`,
    `/read/${book.slug}`,
    ...authorPaths(previous.author),
    ...authorPaths(book.author),
  ];
  const uniquePaths = Array.from(new Set(paths));

  for (const path of uniquePaths) {
    revalidatePath(path);
  }

  editLog("revalidated", { paths: uniquePaths });
}

async function updateBook(request: Request, { params }: RouteContext) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  const uploadedPaths: string[] = [];

  try {
    const { id } = await params;
    const existing = await prisma.book.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }
    const existingPublicationYear = await publicationYearForBookId(id);
    editLog("existing-before-update", rowSummary({ ...existing, publicationDateYear: existingPublicationYear }));

    const body = await request.json();
    editLog("incoming-payload", { id, ...payloadSummary(body) });
    uploadedPaths.push(...blobPathsFromBody(body));
    const normalizedBody = bodyWithPublicationDate(body);
    if (!normalizedBody.ok) {
      await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
      return NextResponse.json({ error: normalizedBody.error, fieldErrors: { publicationDate: [normalizedBody.error] } }, { status: 400 });
    }

    const parsed = bookUpdateSchema.safeParse(normalizedBody.body);

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

    if (!blobStoreConfigured() && (parsed.data.bookBlob || parsed.data.coverBlob)) {
      return NextResponse.json({ error: "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before replacing files." }, { status: 503 });
    }

    const replacementError = validateReplacementFormat(existing.bookBlobPath, existing.fileContentType, parsed.data.format, parsed.data.bookBlob);
    if (replacementError) {
      await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
      return NextResponse.json({ error: replacementError, fieldErrors: { bookFile: [replacementError] } }, { status: 400 });
    }

    if (parsed.data.coverBlob) {
      const coverError = validateCoverBlob(parsed.data.coverBlob);
      if (coverError) {
        await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
        return NextResponse.json({ error: coverError, fieldErrors: { coverFile: [coverError] } }, { status: 400 });
      }
    }

    const publicationYear = publicationYearFromDate(parsed.data.publicationDate);
    const bookData = bookDataFromInput(parsed.data);
    const { publicationDate, ...bookDataWithoutPublicationDate } = bookData;
    const updateData = {
      ...(publicationYear < 0 ? bookDataWithoutPublicationDate : bookData),
      ...(parsed.data.bookBlob ? fileDataFromBlob(parsed.data.bookBlob, parsed.data.format) : {}),
      ...(parsed.data.coverBlob ? coverDataFromBlob(parsed.data.coverBlob) : {}),
    };
    editLog("normalized-update", { id, ...updateSummary(parsed.data), updateKeys: Object.keys(updateData) });

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.book.update({
        where: { id },
        data: updateData,
      });

      if (publicationYear >= 0) return row;

      const publicationDateLiteral = postgresPublicationDateLiteralFromYear(publicationYear);
      await tx.$executeRaw`UPDATE "Book" SET "publicationDate" = ${publicationDateLiteral}::timestamp WHERE "id" = ${id}`;
      return {
        ...row,
        publicationDate,
        publicationDateYear: publicationYear,
      };
    });
    editLog("prisma-update-result", rowSummary(updated));

    const persisted = await prisma.book.findUnique({ where: { id } });
    const persistedWithYear = persisted ? (await withPublicationYears([persisted]))[0] : null;
    editLog("row-after-update", persistedWithYear ? rowSummary(persistedWithYear) : { id, found: false });
    if (!persistedWithYear || !metadataPersisted(persistedWithYear, parsed.data, persistedWithYear.publicationDateYear)) {
      editLog("persistence-verification-failed", {
        id,
        expected: updateSummary(parsed.data),
        expectedBookBlob: parsed.data.bookBlob
          ? {
              url: parsed.data.bookBlob.url,
              pathname: parsed.data.bookBlob.pathname,
              size: parsed.data.bookBlob.size,
            }
          : null,
        expectedCoverBlob: parsed.data.coverBlob
          ? {
              url: parsed.data.coverBlob.url,
              pathname: parsed.data.coverBlob.pathname,
              contentType: parsed.data.coverBlob.contentType,
            }
          : null,
        persisted: persistedWithYear
          ? {
              title: persistedWithYear.title,
              author: persistedWithYear.author,
              format: persistedWithYear.format,
              category: persistedWithYear.category,
              pageCount: persistedWithYear.pageCount,
              publicationDate: rowSummary(persistedWithYear).publicationDate,
              bookBlobUrl: persistedWithYear.bookBlobUrl,
              bookBlobPath: persistedWithYear.bookBlobPath,
              fileSize: persistedWithYear.fileSize,
              coverBlobUrl: persistedWithYear.coverBlobUrl,
              coverBlobPath: persistedWithYear.coverBlobPath,
              coverContentType: persistedWithYear.coverContentType,
            }
          : null,
      });
      throw new Error("Book update did not persist expected metadata.");
    }

    const slugRow = await prisma.book.findUnique({ where: { slug: persistedWithYear.slug } });
    const slugRowWithYear = slugRow ? (await withPublicationYears([slugRow]))[0] : null;
    editLog("slug-row-after-update", slugRowWithYear ? rowSummary(slugRowWithYear) : { slug: persistedWithYear.slug, found: false });
    if (!slugRowWithYear || slugRowWithYear.id !== persistedWithYear.id) {
      throw new Error("Book update persisted, but slug lookup resolves to a different row.");
    }

    const duplicateRows = await prisma.book.findMany({
      where: {
        title: persistedWithYear.title,
        author: persistedWithYear.author,
      },
      select: { id: true, slug: true, title: true, author: true },
      orderBy: [{ uploadDate: "desc" }, { title: "asc" }],
    });
    if (duplicateRows.length > 1) {
      editLog("duplicate-title-author-rows", { rows: duplicateRows });
    }

    if (parsed.data.bookBlob && existing.bookBlobPath !== parsed.data.bookBlob.pathname) {
      await deleteBlobIfPresent(existing.bookBlobPath);
    }
    if (parsed.data.coverBlob && existing.coverBlobPath !== parsed.data.coverBlob.pathname) {
      await deleteBlobIfPresent(existing.coverBlobPath);
    }

    revalidateBookPaths(persistedWithYear, { slug: existing.slug, author: existing.author });
    editLog("verified-update-result", {
      id: persistedWithYear.id,
      slug: persistedWithYear.slug,
      title: persistedWithYear.title,
      author: persistedWithYear.author,
      updatedAt: persistedWithYear.updatedAt.toISOString(),
    });

    return NextResponse.json({ ok: true, book: serializeBook(persistedWithYear) });
  } catch (error) {
    await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
    return NextResponse.json({ error: safeAdminError(error, error instanceof Error ? error.message : "The book could not be updated.") }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return updateBook(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return updateBook(request, context);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.book.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    if (!blobStoreConfigured()) {
      return NextResponse.json({ error: "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before deleting books so stored files can be removed safely." }, { status: 503 });
    }

    await prisma.book.delete({ where: { id } });
    await Promise.all([deleteBlobIfPresent(existing.bookBlobPath), deleteBlobIfPresent(existing.coverBlobPath)]);
    for (const path of ["/", "/admin", "/admin/books", `/admin/books/${existing.id}/edit`, `/books/${existing.slug}`, `/read/${existing.slug}`, ...authorPaths(existing.author)]) {
      revalidatePath(path);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeAdminError(error, "The book could not be deleted.") }, { status: 500 });
  }
}
