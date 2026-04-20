const PARTIAL_YEAR_PATTERN = /^-?\d*$/;
const COMPLETE_YEAR_PATTERN = /^-?\d+$/;

export function sanitizePublicationYearInput(value: string) {
  const trimmed = value.trim();
  return PARTIAL_YEAR_PATTERN.test(trimmed) ? trimmed : null;
}

export function dateFromPublicationYear(year: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function parsePublicationYearInput(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true as const, date: null, year: null };
  if (!COMPLETE_YEAR_PATTERN.test(text)) return { ok: false as const, error: "Invalid year" };

  const year = Number(text);
  if (!Number.isSafeInteger(year)) return { ok: false as const, error: "Invalid year" };

  return { ok: true as const, date: dateFromPublicationYear(year), year };
}

export function publicationYearInputError(value: string) {
  const parsed = parsePublicationYearInput(value);
  if (!parsed.ok) return parsed.error;
  if (!parsed.date) return "Publication year is required.";
  return "";
}

export function publicationYearInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getFullYear());
}
