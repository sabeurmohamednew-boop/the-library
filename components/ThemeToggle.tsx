"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyGlobalTheme, getClientTheme, THEME_STORAGE_KEY, type GlobalTheme } from "@/lib/theme";

function persistTheme(theme: GlobalTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for the current page if storage is unavailable.
  }
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<GlobalTheme>("light");
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && theme === "dark";
  const label = mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme";

  useEffect(() => {
    setTheme(getClientTheme());
    setMounted(true);
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";
      persistTheme(nextTheme);
      applyGlobalTheme(nextTheme);
      return nextTheme;
    });
  }

  return (
    <button
      className={["icon-button", "theme-toggle", className].filter(Boolean).join(" ")}
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
      <span className="sr-only">{label}</span>
    </button>
  );
}
