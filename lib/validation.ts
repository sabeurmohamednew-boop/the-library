import { z } from "zod";
import { normalizeAuthorsForStorage } from "@/lib/authors";
import { BOOK_CATEGORY_VALUES } from "@/lib/config";
import { parsePublicationDateInput } from "@/lib/publicationYear";

const authorSchema = z
  .string()
  .transform((value) => normalizeAuthorsForStorage(value))
  .pipe(z.string().min(1, "Author is required.").max(240));

const publicationDateSchema = z.any().transform((value, context) => {
  const parsed = parsePublicationDateInput(value);
  if (parsed.ok) {
    return parsed.date;
  }

  context.addIssue({ code: "custom", message: parsed.error });
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
