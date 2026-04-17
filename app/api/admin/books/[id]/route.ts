import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import {
  bookDataFromInput,
  coverDataFromBlob,
  fileDataFromBlob,
  safeAdminError,
  validateReplacementFormat,
} from "@/lib/adminBooks";
import { serializeBook } from "@/lib/books";
import { prisma } from "@/lib/db";
import { deleteBlobIfPresent, validateCoverBlob } from "@/lib/storage";
import { bookUpdateSchema } from "@/lib/validation";

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

export async function PATCH(request: Request, { params }: RouteContext) {
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

    const updated = await prisma.book.update({
      where: { id },
      data: {
        ...bookDataFromInput(parsed.data),
        ...(parsed.data.bookBlob ? fileDataFromBlob(parsed.data.bookBlob, parsed.data.format) : {}),
        ...(parsed.data.coverBlob ? coverDataFromBlob(parsed.data.coverBlob) : {}),
      },
    });

    if (parsed.data.bookBlob && existing.bookBlobPath !== parsed.data.bookBlob.pathname) {
      await deleteBlobIfPresent(existing.bookBlobPath);
    }
    if (parsed.data.coverBlob && existing.coverBlobPath !== parsed.data.coverBlob.pathname) {
      await deleteBlobIfPresent(existing.coverBlobPath);
    }

    return NextResponse.json({ ok: true, book: serializeBook(updated) });
  } catch (error) {
    await Promise.all(uploadedPaths.map((pathname) => deleteBlobIfPresent(pathname)));
    return NextResponse.json({ error: safeAdminError(error, "The book could not be updated.") }, { status: 500 });
  }
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

    await prisma.book.delete({ where: { id } });
    await Promise.all([deleteBlobIfPresent(existing.bookBlobPath), deleteBlobIfPresent(existing.coverBlobPath)]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeAdminError(error, "The book could not be deleted.") }, { status: 500 });
  }
}
