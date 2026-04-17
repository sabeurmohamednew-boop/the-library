import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { blobStoreConfigured } from "@/lib/storage";

export const runtime = "nodejs";

const BOOK_CONTENT_TYPES = ["application/pdf", "application/epub+zip", "application/octet-stream"];
const COVER_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BOOK_SIZE = 500 * 1024 * 1024;
const MAX_COVER_SIZE = 12 * 1024 * 1024;

function parseKind(clientPayload: string | null) {
  if (!clientPayload) return null;
  try {
    const parsed = JSON.parse(clientPayload) as { kind?: unknown };
    return parsed.kind === "book" || parsed.kind === "cover" ? parsed.kind : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  if (body.type === "blob.generate-client-token" && !(await isAdminSession())) {
    return NextResponse.json({ error: "Owner session required." }, { status: 401 });
  }

  if (!blobStoreConfigured()) {
    return NextResponse.json({ error: "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN before uploading books." }, { status: 503 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        if (!(await isAdminSession())) {
          throw new Error("Owner session required.");
        }

        const kind = parseKind(clientPayload);
        if (!kind) {
          throw new Error("Upload type is required.");
        }

        return {
          allowedContentTypes: kind === "book" ? BOOK_CONTENT_TYPES : COVER_CONTENT_TYPES,
          maximumSizeInBytes: kind === "book" ? MAX_BOOK_SIZE : MAX_COVER_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ kind }),
        };
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[blob-upload]", error);
    }

    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload could not be authorized." }, { status: 400 });
  }
}
