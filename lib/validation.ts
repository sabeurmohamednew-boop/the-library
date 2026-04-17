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

export type BookImportInput = z.infer<typeof bookImportSchema>;
