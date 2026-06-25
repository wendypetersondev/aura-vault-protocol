"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-700 p-1 bg-white dark:bg-zinc-900">
      <button
        onClick={() => setTheme("light")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          theme === "light"
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        }`}
        aria-label="Light theme"
      >
        <Sun size={14} />
        Light
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          theme === "dark"
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        }`}
        aria-label="Dark theme"
      >
        <Moon size={14} />
        Dark
      </button>
      <button
        onClick={() => setTheme("system")}
        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          theme === "system"
            ? "bg-zinc-100 dark:bg-zinc-800"
            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        }`}
        aria-label="System theme"
      >
        Auto
      </button>
    </div>
  );
}
