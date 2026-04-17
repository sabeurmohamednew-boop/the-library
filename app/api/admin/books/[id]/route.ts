import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/adminAuth";
import { authorPath } from "@/lib/authors";
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

function metadataPersisted(book: { title: string; description: string; author: string; format: string; category: string; pageCount: number; publicationDate: Date }, input: BookUpdateInput) {
  return (
    book.title === input.title &&
    book.description === input.description &&
    book.author === input.author &&
    book.format === input.format &&
    book.category === input.category &&
    book.pageCount === input.pageCount &&
    book.publicationDate.getTime() === input.publicationDate.getTime()
  );
}

function revalidateBookPaths(book: { id: string; slug: string; author: string }, previousAuthor: string) {
  const paths = [
    "/",
    "/admin",
    "/admin/books",
    `/admin/books/${book.id}/edit`,
    `/books/${book.slug}`,
    `/read/${book.slug}`,
    authorPath(previousAuthor),
    authorPath(book.author),
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

    await prisma.book.update({
      where: { id },
      data: updateData,
    });

    const persisted = await prisma.book.findUnique({ where: { id } });
    if (!persisted || !metadataPersisted(persisted, parsed.data)) {
      editLog("persistence-verification-failed", {
        id,
        expected: updateSummary(parsed.data),
        persisted: persisted
          ? {
              title: persisted.title,
              author: persisted.author,
              format: persisted.format,
              category: persisted.category,
              pageCount: persisted.pageCount,
              publicationDate: persisted.publicationDate.toISOString(),
            }
          : null,
      });
      throw new Error("Book update did not persist expected metadata.");
    }

    if (parsed.data.bookBlob && existing.bookBlobPath !== parsed.data.bookBlob.pathname) {
      await deleteBlobIfPresent(existing.bookBlobPath);
    }
    if (parsed.data.coverBlob && existing.coverBlobPath !== parsed.data.coverBlob.pathname) {
      await deleteBlobIfPresent(existing.coverBlobPath);
    }

    revalidateBookPaths(persisted, existing.author);
    editLog("prisma-update-result", {
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
    for (const path of ["/", "/admin", "/admin/books", `/admin/books/${existing.id}/edit`, `/books/${existing.slug}`, `/read/${existing.slug}`, authorPath(existing.author)]) {
      revalidatePath(path);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeAdminError(error, "The book could not be deleted.") }, { status: 500 });
  }
}
