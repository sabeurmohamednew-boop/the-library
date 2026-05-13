"use client";

import type { BlobDescriptor } from "@/lib/types";

type UploadKind = "book" | "cover";

export async function uploadAdminBlob(file: File, kind: UploadKind, slugHint: string) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("kind", kind);
  formData.set("slugHint", slugHint);

  const response = await fetch("/api/admin/r2/upload", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as { blob?: BlobDescriptor; error?: string } | null;
  if (!response.ok || !payload?.blob) {
    throw new Error(payload?.error || "The file could not be uploaded.");
  }

  return payload.blob;
}
