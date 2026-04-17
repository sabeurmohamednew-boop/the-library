import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.mjs");
const target = join(root, "public", "pdf.worker.mjs");

try {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
} catch (error) {
  console.warn("PDF.js worker could not be copied yet:", error instanceof Error ? error.message : error);
}
