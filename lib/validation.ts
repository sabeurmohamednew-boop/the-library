import { z } from "zod";
import { normalizeAuthorsForStorage } from "@/lib/authors";
import { BOOK_CATEGORY_VALUES } from "@/lib/config";
import { dateFromPublicationYear, parsePublicationYearInput } from "@/lib/publicationYear";

const authorSchema = z
  .string()
  .transform((value) => normalizeAuthorsForStorage(value))
  .pipe(z.string().min(1, "Author is required.").max(240));

function normalizeHistoricalDateString(value: string) {
  return value.replace(/^-(\d{4})(?=-)/, (_match, year: string) => `-${year.padStart(6, "0")}`);
}

const publicationDateSchema = z.any().transform((value, context) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return dateFromPublicationYear(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsedYear = parsePublicationYearInput(trimmed);

    if (parsedYear.ok && parsedYear.date) return parsedYear.date;
    if (parsedYear.ok && !parsedYear.date) {
      context.addIssue({ code: "custom", message: "Publication year is required." });
      return new Date(NaN);
    }

    if (/^-?\d{4,6}-\d{2}-\d{2}/.test(trimmed)) {
      const date = new Date(normalizeHistoricalDateString(trimmed));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  context.addIssue({ code: "custom", message: "Invalid year" });
  return new Date(NaN);
});

export const bookImportSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(240),
  description: z.string().trim().min(1, "Description is required.").max(5000),
  author: authorSchema,
  format: z.enum(["PDF", "EPUB"]),
  category: z.enum(BOOK_CATEGORY_VALUES),
  pageCount: z.coerce.number().int().min(1, "Page count is required.").max(100000),
  publicationDate: publicationDateSchema,
});

export const blobDescriptorSchema = z.object({
  url: z.string().url("Uploaded file URL is invalid."),
  pathname: z.string().trim().min(1, "Uploaded file path is missing."),
  contentType: z.string().trim().min(1, "Uploaded file type is missing."),
  size: z.coerce.number().int().min(1, "Uploaded file is empty."),
});

export const bookCreateSchema = bookImportSchema.extend({
  bookBlob: blobDescriptorSchema,
  coverBlob: blobDescriptorSchema,
});

export const bookUpdateSchema = bookImportSchema.extend({
  bookBlob: blobDescriptorSchema.optional(),
  coverBlob: blobDescriptorSchema.optional(),
});

export type BookImportInput = z.infer<typeof bookImportSchema>;
export type BookCreateInput = z.infer<typeof bookCreateSchema>;
export type BookUpdateInput = z.infer<typeof bookUpdateSchema>;
