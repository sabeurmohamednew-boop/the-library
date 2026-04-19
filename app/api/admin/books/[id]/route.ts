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
import { serializeBook } from "@/lib/books";
import { prisma } from "@/lib/db";
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
  updatedAt: Date;
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
    publicationDate: book.publicationDate.toISOString(),
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
    bookBlobUrl: string;
    bookBlobPath: string;
    fileSize: number;
    coverBlobUrl: string;
    coverBlobPath: string;
    coverContentType: string;
  },
  input: BookUpdateInput,
) {
  const metadataMatches =
    book.title === input.title &&
    book.description === input.description &&
    book.author === input.author &&
    book.format === input.format &&
    book.category === input.category &&
    book.pageCount === input.pageCount &&
    book.publicationDate.getTime() === input.publicationDate.getTime();

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
    editLog("existing-before-update", rowSummary(existing));

    const body = await request.json();
    editLog("incoming-payload", { id, ...payloadSummary(body) });
    uploadedPaths.push(...blobPathsFromBody(body));
    const parsed = bookUpdateSchema.safeParse(body);

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

    const updateData = {
      ...bookDataFromInput(parsed.data),
      ...(parsed.data.bookBlob ? fileDataFromBlob(parsed.data.bookBlob, parsed.data.format) : {}),
      ...(parsed.data.coverBlob ? coverDataFromBlob(parsed.data.coverBlob) : {}),
    };
    editLog("normalized-update", { id, ...updateSummary(parsed.data), updateKeys: Object.keys(updateData) });

    const updated = await prisma.book.update({
      where: { id },
      data: updateData,
    });
    editLog("prisma-update-result", rowSummary(updated));

    const persisted = await prisma.book.findUnique({ where: { id } });
    editLog("row-after-update", persisted ? rowSummary(persisted) : { id, found: false });
    if (!persisted || !metadataPersisted(persisted, parsed.data)) {
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
        persisted: persisted
          ? {
              title: persisted.title,
              author: persisted.author,
              format: persisted.format,
              category: persisted.category,
              pageCount: persisted.pageCount,
              publicationDate: persisted.publicationDate.toISOString(),
              bookBlobUrl: persisted.bookBlobUrl,
              bookBlobPath: persisted.bookBlobPath,
              fileSize: persisted.fileSize,
              coverBlobUrl: persisted.coverBlobUrl,
              coverBlobPath: persisted.coverBlobPath,
              coverContentType: persisted.coverContentType,
            }
          : null,
      });
      throw new Error("Book update did not persist expected metadata.");
    }

    const slugRow = await prisma.book.findUnique({ where: { slug: persisted.slug } });
    editLog("slug-row-after-update", slugRow ? rowSummary(slugRow) : { slug: persisted.slug, found: false });
    if (!slugRow || slugRow.id !== persisted.id) {
      throw new Error("Book update persisted, but slug lookup resolves to a different row.");
    }

    const duplicateRows = await prisma.book.findMany({
      where: {
        title: persisted.title,
        author: persisted.author,
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

    revalidateBookPaths(persisted, { slug: existing.slug, author: existing.author });
    editLog("verified-update-result", {
      id: persisted.id,
      slug: persisted.slug,
      title: persisted.title,
      author: persisted.author,
      updatedAt: persisted.updatedAt.toISOString(),
    });

    return NextResponse.json({ ok: true, book: serializeBook(persisted) });
  } catch (error) {
    await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
    return NextResponse.json({ error: safeAdminError(error, "The book could not be updated.") }, { status: 500 });
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
