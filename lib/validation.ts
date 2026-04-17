import { z } from "zod";

export const bookImportSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(240),
  description: z.string().trim().min(1, "Description is required.").max(5000),
  author: z.string().trim().min(1, "Author is required.").max(240),
  format: z.enum(["PDF", "EPUB"]),
  category: z.enum(["SELF_IMPROVEMENT", "NOFAP"]),
  pageCount: z.coerce.number().int().min(1, "Page count is required.").max(100000),
  publicationDate: z.coerce.date(),
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
