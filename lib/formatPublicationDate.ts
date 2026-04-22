import type { PublicationDatePrecision } from "@/lib/publicationYear";

function normalizeHistoricalDateString(value: string) {
  return value.replace(/^-(\d{4})(?=-)/, (_match, year: string) => `-${year.padStart(6, "0")}`);
}

function parsePublicationDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;

  return new Date(normalizeHistoricalDateString(value));
}

function formatPublicationDay(date: Date) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatPublicationDate(value: string | Date | null | undefined, precision: PublicationDatePrecision = "YEAR") {
  const date = parsePublicationDate(value);
  if (!date || Number.isNaN(date.getTime())) return "Unknown";

  const year = date.getUTCFullYear();
  if (precision === "DAY" && year >= 1) return formatPublicationDay(date);
  if (year >= 1) return String(year);

  return `c. ${Math.abs(year)} BC`;
}
