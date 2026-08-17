"use client";

import { useEffect, useRef } from "react";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import type { ThemeMode } from "@/lib/theme";

export default function ThemeSync() {
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/preferences", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        const server = body?.data?.theme as unknown;
        if (server !== "light" && server !== "dark") return;
        const serverMode = server as ThemeMode;
        if (serverMode !== readStoredTheme() && !cancelled) {
          applyTheme(serverMode);
        }
      } catch {
        /* offline / network error — keep the local theme */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}