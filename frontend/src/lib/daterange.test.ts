import { describe, expect, it } from "vitest";
import { inDateRange } from "@/lib/daterange";

describe("inDateRange", () => {
  it("passes everything when both bounds are empty", () => {
    expect(inDateRange("2026-01-15T10:00:00", "", "")).toBe(true);
    expect(inDateRange(null, "", "")).toBe(true);
    expect(inDateRange(undefined, "", "")).toBe(true);
    expect(inDateRange("", "", "")).toBe(true);
  });

  it("filters by a from bound inclusively", () => {
    expect(inDateRange("2026-03-01T00:00:00", "2026-03-01", "")).toBe(true);
    expect(inDateRange("2026-03-02T23:59:59", "2026-03-01", "")).toBe(true);
    expect(inDateRange("2026-02-28T23:59:59", "2026-03-01", "")).toBe(false);
  });

  it("filters by a to bound inclusively", () => {
    expect(inDateRange("2025-12-31T23:59:59", "", "2025-12-31")).toBe(true);
    expect(inDateRange("2026-01-01T00:00:00", "", "2025-12-31")).toBe(false);
  });

  it("requires both bounds when present", () => {
    expect(inDateRange("2026-06-15", "2026-06-01", "2026-06-30")).toBe(true);
    expect(inDateRange("2026-05-31", "2026-06-01", "2026-06-30")).toBe(false);
    expect(inDateRange("2026-07-01", "2026-06-01", "2026-06-30")).toBe(false);
  });

  it("compares only the day portion of timestamps", () => {
    expect(inDateRange("2026-06-30T23:59:59.999Z", "2026-06-01", "2026-06-30")).toBe(true);
    expect(inDateRange("2026-06-01T00:00:00.000Z", "2026-06-01", "2026-06-30")).toBe(true);
  });

  it("returns false for null/undefined values when a bound exists", () => {
    expect(inDateRange(null, "2026-01-01", "")).toBe(false);
    expect(inDateRange(undefined, "", "2026-01-01")).toBe(false);
  });

  it("treats out-of-order bounds as an empty window", () => {
    expect(inDateRange("2026-06-15", "2026-06-30", "2026-06-01")).toBe(false);
  });

  it("handles non-ISO strings via lexicographic day comparison", () => {
    expect(inDateRange("2026-6-5", "2026-06-01", "")).toBe(true);
  });
});