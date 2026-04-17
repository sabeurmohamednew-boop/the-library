import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminSession } from "@/lib/adminAuth";
import { serializeBook } from "@/lib/books";
import { bookImportSchema } from "@/lib/validation";
import {
  bookDataFromInput,
  bookExtensionFor,
  coverExtension,
  formFile,
  formValue,
  safeAdminError,
  saveUploadedFile,
  uniqueSlug,
  uploadPath,
  validateBookFile,
} from "@/lib/adminBooks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  try {
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

    const bookFile = formFile(formData, "bookFile");
    const coverFile = formFile(formData, "coverFile");

    if (!bookFile) {
      return NextResponse.json({ error: "A PDF or EPUB file is required.", fieldErrors: { bookFile: ["A PDF or EPUB file is required."] } }, { status: 400 });
    }

    if (!coverFile) {
      return NextResponse.json({ error: "A cover image is required.", fieldErrors: { coverFile: ["A cover image is required."] } }, { status: 400 });
    }

    const bookFileError = validateBookFile(bookFile, parsed.data.format);
    if (bookFileError) {
      return NextResponse.json({ error: bookFileError, fieldErrors: { bookFile: [bookFileError] } }, { status: 400 });
    }

    const imageExtension = coverExtension(coverFile);
    if (!imageExtension) {
      return NextResponse.json({ error: "Cover image must be JPG, PNG, WEBP, or AVIF.", fieldErrors: { coverFile: ["Cover image must be JPG, PNG, WEBP, or AVIF."] } }, { status: 400 });
    }

    const slug = await uniqueSlug(parsed.data.title);
    const now = Date.now();
    const bookRelativePath = uploadPath("books", slug, bookExtensionFor(parsed.data.format), now);
    const coverRelativePath = uploadPath("covers", slug, imageExtension, now);

    await saveUploadedFile(bookRelativePath, bookFile);
    await saveUploadedFile(coverRelativePath, coverFile);

    const book = await prisma.book.create({
      data: {
        ...bookDataFromInput(parsed.data),
        slug,
        uploadDate: new Date(),
        filePath: bookRelativePath,
        coverImagePath: coverRelativePath,
        fileSize: bookFile.size,
      },
    });

    return NextResponse.json({
      ok: true,
      book: serializeBook(book),
    });
  } catch (error) {
    return NextResponse.json({ error: safeAdminError(error, "The book could not be imported.") }, { status: 500 });
  }
}
