import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdminSession } from "@/lib/adminAuth";
import { authorPath } from "@/lib/authors";
import { serializeBook } from "@/lib/books";
import { bookCreateSchema } from "@/lib/validation";
import { bookDataFromInput, coverDataFromBlob, fileDataFromBlob, safeAdminError, uniqueSlug } from "@/lib/adminBooks";
import { blobStoreConfigured, deleteBlobIfPresent, validateBookBlob, validateCoverBlob } from "@/lib/storage";

export const runtime = "nodejs";

function revalidateCreatePaths(book: { slug: string; author: string }) {
  for (const path of ["/", "/admin", "/admin/books", `/books/${book.slug}`, `/read/${book.slug}`, authorPath(book.author)]) {
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
    const parsed = bookCreateSchema.safeParse(body);

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

    const book = await prisma.book.create({
      data: {
        ...bookDataFromInput(parsed.data),
        ...fileDataFromBlob(parsed.data.bookBlob, parsed.data.format),
        ...coverDataFromBlob(parsed.data.coverBlob),
        slug,
        uploadDate: new Date(),
      },
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
