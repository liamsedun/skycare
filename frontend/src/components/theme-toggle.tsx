"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = readStoredTheme();
    setMode(initial);
    document.documentElement.dataset.theme = initial;
    return () => {};
  }, []);

  function toggle() {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    fetch("/api/account/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={mode === "dark"}
      aria-label="Toggle dark mode"
      className={`focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-200 ${
        compact
          ? "w-9 p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
          : "border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-foreground)] hover:bg-slate-50"
      }`}
    >
      {mode === "dark" ? (
        <Moon size={compact ? 16 : 18} className="text-[var(--color-primary)]" aria-hidden="true" />
      ) : (
        <Sun size={compact ? 16 : 18} className="text-[var(--color-primary)]" aria-hidden="true" />
      )}
      {!compact && <span>{mode === "dark" ? "Dark mode" : "Light mode"}</span>}
    </button>
  );
}