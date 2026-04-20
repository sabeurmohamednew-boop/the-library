const PARTIAL_YEAR_PATTERN = /^-?\d*$/;
const COMPLETE_YEAR_PATTERN = /^-?\d+$/;
const HISTORICAL_DATE_PATTERN = /^-?\d{4,6}-\d{2}-\d{2}/;

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

export function normalizeHistoricalDateString(value: string) {
  return value.replace(/^-(\d{4})(?=-)/, (_match, year: string) => `-${year.padStart(6, "0")}`);
}

export function dateFromHistoricalDateString(value: string) {
  if (!HISTORICAL_DATE_PATTERN.test(value)) return null;

  const date = new Date(normalizeHistoricalDateString(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function publicationYearFromDate(value: Date) {
  return value.getUTCFullYear();
}

export function postgresPublicationDateLiteralFromYear(year: number) {
  if (year < 0) return `${String(Math.abs(year)).padStart(4, "0")}-01-01 BC`;
  return `${String(year).padStart(4, "0")}-01-01 00:00:00`;
}

export function publicationDateIsoFromYear(year: number) {
  return dateFromPublicationYear(year).toISOString();
}

export function parsePublicationYearInput(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true as const, date: null, year: null };
  if (!COMPLETE_YEAR_PATTERN.test(text)) return { ok: false as const, error: "Invalid publication year" };

  const year = Number(text);
  if (!Number.isSafeInteger(year)) return { ok: false as const, error: "Invalid publication year" };

  return { ok: true as const, date: dateFromPublicationYear(year), year };
}

export function parsePublicationDateInput(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true as const, date: value, year: publicationYearFromDate(value) };
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return { ok: true as const, date: dateFromPublicationYear(value), year: value };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsedYear = parsePublicationYearInput(trimmed);
    if (parsedYear.ok && parsedYear.date) return parsedYear;
    if (parsedYear.ok && !parsedYear.date) return { ok: false as const, error: "Publication year is required." };

    const date = dateFromHistoricalDateString(trimmed);
    if (date) return { ok: true as const, date, year: publicationYearFromDate(date) };
  }

  return { ok: false as const, error: "Invalid publication year" };
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
