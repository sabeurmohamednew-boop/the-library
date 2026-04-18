import type { ReaderTheme } from "@/lib/types";

export type GlobalTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

export function isGlobalTheme(value: unknown): value is GlobalTheme {
  return value === "light" || value === "dark";
}

export function getSystemTheme(): GlobalTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getClientTheme(): GlobalTheme {
  if (typeof window === "undefined") return "light";

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isGlobalTheme(storedTheme)) return storedTheme;

  const htmlTheme = document.documentElement.dataset.theme;
  if (isGlobalTheme(htmlTheme)) return htmlTheme;

  return getSystemTheme();
}

export function applyGlobalTheme(theme: GlobalTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function readerThemeForGlobalTheme(theme: GlobalTheme): ReaderTheme {
  return theme === "dark" ? "dark" : "light";
}
