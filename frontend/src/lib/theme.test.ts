// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readStoredTheme, THEME_STORAGE_KEY, watchTheme } from "@/lib/theme";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("readStoredTheme", () => {
  it("defaults to light with no stored value", () => {
    expect(readStoredTheme()).toBe("light");
  });

  it("reads the stored dark value", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("treats any junk value as light", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(readStoredTheme()).toBe("light");
  });
});

describe("applyTheme", () => {
  it("sets the data-theme attribute and persists", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("dispatches the theme-changed event with the mode", () => {
    const fn = vi.fn();
    window.addEventListener("skycare:theme-changed", fn);
    applyTheme("light");
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ detail: "light" }));
  });
});

describe("watchTheme", () => {
  it("applies details from dispatched theme events", () => {
    watchTheme();
    window.dispatchEvent(new CustomEvent("skycare:theme-changed", { detail: "dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});