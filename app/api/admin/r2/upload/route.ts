import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { r2ConfigError, uploadR2File } from "@/lib/r2";

export const runtime = "nodejs";

function parseKind(value: FormDataEntryValue | null) {
  return value === "book" || value === "cover" ? value : null;
}

export async function POST(request: Request) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  const configError = r2ConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const kind = parseKind(formData.get("kind"));
    const slugHint = String(formData.get("slugHint") ?? "");
    const file = formData.get("file");

    if (!kind) {
      return NextResponse.json({ error: "Upload type is required." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    const blob = await uploadR2File(file, kind, slugHint);
    return NextResponse.json({ blob });
  } catch (error) {
    console.error("[r2-upload]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "The file could not be uploaded to R2." }, { status: 400 });
  }
}
