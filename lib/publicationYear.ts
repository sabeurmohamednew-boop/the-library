const PARTIAL_YEAR_PATTERN = /^-?\d*$/;
const COMPLETE_YEAR_PATTERN = /^-?\d+$/;
const HISTORICAL_DATE_PATTERN = /^-?\d{4,6}-\d{2}-\d{2}/;
const PARTIAL_DATE_PATTERN = /^\d{0,2}(?:\/\d{0,2}(?:\/\d{0,4})?)?$/;
const COMPLETE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export type PublicationDatePrecision = "YEAR" | "DAY";

export function sanitizePublicationYearInput(value: string) {
  const trimmed = value.trim();
  return PARTIAL_YEAR_PATTERN.test(trimmed) || PARTIAL_DATE_PATTERN.test(trimmed) ? trimmed : null;
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

export function dateFromPublicationDay(day: number, month: number, year: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function parsePublicationDayInput(value: string) {
  const match = COMPLETE_DATE_PATTERN.exec(value.trim());
  if (!match) return { ok: false as const, error: "Use dd/mm/yyyy for full publication dates." };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1) return { ok: false as const, error: "Use a year from 0001 to 9999 for full publication dates." };

  const date = dateFromPublicationDay(day, month, year);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false as const, error: "Publication date must be a real date in dd/mm/yyyy format." };
  }

  return { ok: true as const, date, year, precision: "DAY" as const };
}

export function parsePublicationYearInput(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true as const, date: null, year: null };
  if (!COMPLETE_YEAR_PATTERN.test(text)) return { ok: false as const, error: "Invalid publication year" };

  const year = Number(text);
  if (!Number.isSafeInteger(year)) return { ok: false as const, error: "Invalid publication year" };

  return { ok: true as const, date: dateFromPublicationYear(year), year, precision: "YEAR" as const };
}

export function parsePublicationDateInput(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true as const, date: value, year: publicationYearFromDate(value), precision: "DAY" as const };
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return { ok: true as const, date: dateFromPublicationYear(value), year: value, precision: "YEAR" as const };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false as const, error: "Publication date is required." };

    if (trimmed.includes("/")) {
      return parsePublicationDayInput(trimmed);
    }

    const parsedYear = parsePublicationYearInput(trimmed);
    if (parsedYear.ok && parsedYear.date) return parsedYear;
    if (parsedYear.ok && !parsedYear.date) return { ok: false as const, error: "Publication date is required." };

    const date = dateFromHistoricalDateString(trimmed);
    if (date) return { ok: true as const, date, year: publicationYearFromDate(date), precision: "DAY" as const };
  }

  return { ok: false as const, error: "Use a valid publication year or a real date in dd/mm/yyyy format." };
}

export function publicationYearInputError(value: string) {
  const parsed = parsePublicationDateInput(value);
  if (!parsed.ok) return parsed.error;
  if (!parsed.date) return "Publication date is required.";
  return "";
}

export const publicationDateInputError = publicationYearInputError;

export function publicationYearInputValue(value: string | Date | null | undefined, precision: PublicationDatePrecision = "YEAR") {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (precision === "DAY") {
    return [date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear()].map((part) => String(part).padStart(2, "0")).join("/");
  }
  return String(date.getUTCFullYear());
}

export const publicationDateInputValue = publicationYearInputValue;
