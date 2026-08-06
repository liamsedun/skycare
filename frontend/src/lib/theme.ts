export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "skycare-theme";

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

export function applyTheme(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  const rootEls: HTMLElement | never = document.documentElement;
  rootEls.dataset.theme = mode;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
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