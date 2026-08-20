// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  dateStamp,
  downloadCsv,
  escapeCsv,
  letterheadHtml,
  parseCsv,
  splitPdfLine,
} from "@/lib/export";

describe("escapeCsv", () => {
  it("passes through plain values", () => {
    expect(escapeCsv("abc")).toBe("abc");
    expect(escapeCsv(123)).toBe("123");
    expect(escapeCsv(0)).toBe("0");
  });

  it("renders nullish values as empty cells", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
  });

  it("does not quote cells that merely end with a quote character", () => {
    expect(escapeCsv('plain"')).toBe('"plain"""');
  });
});

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips the BOM", () => {
    expect(parseCsv("\uFEFFa,b\nc,d")[0]).toEqual(["a", "b"]);
  });

  it("handles quoted cells with embedded commas and escaped quotes", () => {
    expect(parseCsv('a,"x,y",b\n"say ""hi""",2,3')).toEqual([
      ["a", "x,y", "b"],
      ['say "hi"', "2", "3"],
    ]);
  });

  it("tolerates CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a,b\n\n\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("round-trips with escapeCsv", () => {
    const cells = ["name", "n/a", 'he said "hi", ok', 42, null];
    const csv = cells.map(escapeCsv).join(",");
    expect(parseCsv(csv)).toEqual([["name", "n/a", 'he said "hi", ok', "42", ""]]);
  });
});

describe("dateStamp", () => {
  it("returns the current UTC date in ISO day form", () => {
    const stamp = dateStamp();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stamp).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("downloadCsv", () => {
  it("triggers a BOM-prefixed CSV download", () => {
    const click = vi.fn();
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: revoke,
    });
    document.createElement = vi.fn().mockImplementation((tag: string) => {
      if (tag === "a") return { click, href: "", download: "" } as unknown as HTMLAnchorElement;
      return document.createElement.bind(document)(tag) as unknown as HTMLElement;
    });
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();

    downloadCsv("export.csv", ["Name", "Qty"], [["A", 1]]);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("letterheadHtml", () => {
  it("returns empty markup for missing branding", () => {
    expect(letterheadHtml(null)).toBe("");
    expect(letterheadHtml(undefined)).toBe("");
  });

  it("renders the org name, address and contact line", () => {
    const html = letterheadHtml({
      name: "LiamsField Hospital",
      logo_url: "https://cdn.example/logo.png",
      address: "265 Admiralty Way, Lekki",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      phone: "+2348157377000",
      email: "hello@liamsfieldshospital.com",
      website: "liamsfields.skycare.app",
    });
    expect(html).toContain("LiamsField Hospital");
    expect(html).toContain("265 Admiralty Way, Lekki");
    expect(html).toContain("Lekki, Lagos, Nigeria");
    expect(html).toContain("Tel: +2348157377000");
    expect(html).toContain("Email: hello@liamsfieldshospital.com");
    expect(html).toContain("liamsfields.skycare.app");
    expect(html).toContain("<img");
  });

  it("escapes HTML in brand values", () => {
    const html = letterheadHtml({ name: '<img src=x onerror=alert(1)> & "Co"', address: "A < B & C" });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&amp;");
  });

  it("uses the first letter as the logo fallback and a default name", () => {
    const html = letterheadHtml({ address: "Somewhere" });
    expect(html).toContain("SkyCare HMS");
    expect(html).toContain(">S</div>");
  });
});

describe("splitPdfLine", () => {
  it("splits on runs of 2+ spaces", () => {
    expect(splitPdfLine("Amaryl 1  12  3,000.00")).toEqual(["Amaryl 1", "12", "3,000.00"]);
  });

  it("drops a leading empty cell after trimming", () => {
    expect(splitPdfLine("   alpha   beta")).toEqual(["alpha", "beta"]);
  });

  it("keeps single spaces intact", () => {
    expect(splitPdfLine("a b")).toEqual(["a b"]);
  });

  it("returns a single cell for an empty or whitespace-only line", () => {
    expect(splitPdfLine("")).toEqual([]);
    expect(splitPdfLine("    ")).toEqual([""]);
  });
});