export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "skycare-theme";
export const THEME_COOKIE = "skycare-theme";

export type ThemeMode = "light" | "dark";

export function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Read the theme cookie value (server-side or client-side). */
export function readCookieTheme(cookieHeader?: string): ThemeMode {
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)skycare-theme=(dark|light)/);
    return match?.[1] === "dark" ? "dark" : "light";
  }
  if (typeof document === "undefined") return "light";
  const match = document.cookie.match(/(?:^|;\s*)skycare-theme=(dark|light)/);
  return match?.[1] === "dark" ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  document.documentElement.dataset.theme = mode;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  // Set cookie so SSR can read the theme on the next page load (eliminates FOUC).
  document.cookie = `${THEME_COOKIE}=${mode};path=/;max-age=31536000;SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("skycare:theme-changed", { detail: mode }));
}

export function watchTheme(): void {
  if (typeof window === "undefined") return;
  const onChange = (e: Event) => {
    const detail = (e as CustomEvent<ThemeMode>).detail;
    if (detail) {
      document.documentElement.dataset.theme = detail;
    }
  };
  window.addEventListener("skycare:theme-changed", onChange as EventListener);
}