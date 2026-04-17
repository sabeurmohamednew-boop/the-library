import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import {
  bookDataFromInput,
  bookExtensionFor,
  cleanupUnreferencedFile,
  coverExtension,
  formFile,
  formValue,
  safeAdminError,
  saveUploadedFile,
  uploadPath,
  validateReplacementFormat,
} from "@/lib/adminBooks";
import { serializeBook } from "@/lib/books";
import { prisma } from "@/lib/db";
import { bookImportSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await prisma.book.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }

    const formData = await request.formData();
    const parsed = bookImportSchema.safeParse({
      title: formValue(formData, "title"),
      description: formValue(formData, "description"),
      author: formValue(formData, "author"),
      format: formValue(formData, "format"),
      category: formValue(formData, "category"),
      pageCount: formValue(formData, "pageCount"),
      publicationDate: formValue(formData, "publicationDate"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid metadata.",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const replacementFile = formFile(formData, "bookFile");
    const replacementCover = formFile(formData, "coverFile");
    const replacementError = validateReplacementFormat(existing.filePath, parsed.data.format, replacementFile);
    if (replacementError) {
      return NextResponse.json({ error: replacementError, fieldErrors: { bookFile: [replacementError] } }, { status: 400 });
    }

    const coverReplacementExtension = replacementCover ? coverExtension(replacementCover) : "";
    if (replacementCover && !coverReplacementExtension) {
      return NextResponse.json(
        { error: "Cover image must be JPG, PNG, WEBP, or AVIF.", fieldErrors: { coverFile: ["Cover image must be JPG, PNG, WEBP, or AVIF."] } },
        { status: 400 },
      );
    }

    let nextFilePath = existing.filePath;
    let nextCoverPath = existing.coverImagePath;
    let nextFileSize = existing.fileSize;
    const oldFilePath = existing.filePath;
    const oldCoverPath = existing.coverImagePath;
    const version = Date.now();

    if (replacementFile) {
      nextFilePath = uploadPath("books", existing.slug, bookExtensionFor(parsed.data.format), version);
      await saveUploadedFile(nextFilePath, replacementFile);
      nextFileSize = replacementFile.size;
    }

    if (replacementCover) {
      nextCoverPath = uploadPath("covers", existing.slug, coverReplacementExtension, version);
      await saveUploadedFile(nextCoverPath, replacementCover);
    }

    const updated = await prisma.book.update({
      where: { id },
      data: {
        ...bookDataFromInput(parsed.data),
        filePath: nextFilePath,
        coverImagePath: nextCoverPath,
        fileSize: nextFileSize,
      },
    });

    if (oldFilePath !== nextFilePath) {
      await cleanupUnreferencedFile(oldFilePath);
    }
    if (oldCoverPath !== nextCoverPath) {
      await cleanupUnreferencedFile(oldCoverPath);
    }

    return NextResponse.json({ ok: true, book: serializeBook(updated) });
  } catch (error) {
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
    await cleanupUnreferencedFile(existing.filePath);
    await cleanupUnreferencedFile(existing.coverImagePath);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeAdminError(error, "The book could not be deleted.") }, { status: 500 });
  }
}
