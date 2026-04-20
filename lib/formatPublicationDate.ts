import { formatDate } from "@/lib/text";

function normalizeHistoricalDateString(value: string) {
  return value.replace(/^-(\d{4})(?=-)/, (_match, year: string) => `-${year.padStart(6, "0")}`);
}

function parsePublicationDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;

  return new Date(normalizeHistoricalDateString(value));
}

export function formatPublicationDate(value: string | Date | null | undefined) {
  const date = parsePublicationDate(value);
  if (!date || Number.isNaN(date.getTime())) return "Unknown";

  const year = date.getFullYear();
  if (year >= 1000) return formatDate(date);
  if (year >= 1) return `c. ${year} AD`;

  return `c. ${Math.abs(year)} BC`;
}
