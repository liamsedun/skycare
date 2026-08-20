import { describe, expect, it } from "vitest";
import { fmtDate, fmtTime, todayISO } from "@/lib/shift-format";

describe("fmtTime", () => {
  it("formats 24h times into 12h with AM/PM", () => {
    expect(fmtTime("09:00")).toBe("09:00 AM");
    expect(fmtTime("17:00")).toBe("05:00 PM");
    expect(fmtTime("00:05")).toBe("12:05 AM");
    expect(fmtTime("12:30")).toBe("12:30 PM");
  });

  it("handles missing/garbage values", () => {
    expect(fmtTime(null)).toBe("—");
    expect(fmtTime(undefined)).toBe("—");
    expect(fmtTime("")).toBe("—");
    expect(fmtTime("oops")).toBe("oops");
  });
});

describe("fmtDate", () => {
  it("renders the ISO date in the en-NG short style", () => {
    const out = fmtDate("2026-08-19");
    expect(out).toContain("Aug");
    expect(out).toContain("2026");
  });

  it("passes through invalid input", () => {
    expect(fmtDate("not-a-date")).toBe("not-a-date");
  });
});

describe("todayISO", () => {
  it("returns the current UTC date in ISO shape", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});