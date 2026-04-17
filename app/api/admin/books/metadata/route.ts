import path from "node:path";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { formFile, inferEpubMetadata, inferPdfPageCount, safeAdminError } from "@/lib/adminBooks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formFile(formData, "bookFile");
    if (!file) {
      return NextResponse.json({ error: "Choose a PDF or EPUB file first." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = path.extname(file.name).toLowerCase();

    if (extension === ".pdf") {
      return NextResponse.json({
        format: "PDF",
        pageCount: inferPdfPageCount(buffer),
      });
    }

    if (extension === ".epub") {
      const metadata = await inferEpubMetadata(buffer);
      return NextResponse.json({
        format: "EPUB",
        ...(metadata ?? {}),
      });
    }

    return NextResponse.json({ error: "Only PDF and EPUB files are supported." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: safeAdminError(error, "Metadata could not be inferred.") }, { status: 500 });
  }
}
