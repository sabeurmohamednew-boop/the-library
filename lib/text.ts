export function truncateText(value: string, limit: number) {
  if (value.length <= limit) {
    return { text: value, truncated: false };
  }

  const clipped = value.slice(0, Math.max(0, limit - 1)).trimEnd();
  return { text: `${clipped}…`, truncated: true };
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}
