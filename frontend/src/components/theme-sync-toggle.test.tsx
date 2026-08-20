// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ThemeSync from "@/components/theme-sync";
import ThemeToggle from "@/components/theme-toggle";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ThemeSync", () => {
  it("applies the server theme when it differs from the local one", async () => {
    window.localStorage.setItem("skycare-theme", "light");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { theme: "dark" } }),
      }))
    );
    render(<ThemeSync />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(window.localStorage.getItem("skycare-theme")).toBe("dark");
  });

  it("keeps the local theme when the server matches it", async () => {
    window.localStorage.setItem("skycare-theme", "dark");
    document.documentElement.dataset.theme = "dark";
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: { theme: "dark" } }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ThemeSync />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/account/preferences", { cache: "no-store" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ignores invalid server themes and failed fetches", async () => {
    window.localStorage.setItem("skycare-theme", "light");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { theme: "neon" } }) })));
    render(<ThemeSync />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<ThemeSync />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe("ThemeToggle", () => {
  it("initialises from localStorage and toggles with a PUT", async () => {
    window.localStorage.setItem("skycare-theme", "dark");
    const putMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", putMock);

    render(<ThemeToggle />);
    const toggle = screen.getByRole("switch", { name: "Toggle dark mode" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/api/account/preferences",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ theme: "light" }),
        })
      )
    );
  });

  it("shows the label in the non-compact variant", () => {
    window.localStorage.setItem("skycare-theme", "light");
    render(<ThemeToggle />);
    expect(screen.getByText("Light mode")).toBeInTheDocument();
  });
});