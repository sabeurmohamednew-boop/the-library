"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && theme === "dark";
  const label = mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Toggle theme";

  useEffect(() => {
    setMounted(true);
  }, []);

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
