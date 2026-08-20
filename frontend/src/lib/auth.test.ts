import { describe, expect, it } from "vitest";
import {
  getClaims,
  initials,
  isAppRole,
  isStaffRole,
  ngn,
  formatDate,
  formatTime,
  ROLE_LABELS,
  STAFF_ROLES,
  CLINICIAN_ROLES,
} from "@/lib/auth";

describe("isStaffRole", () => {
  it("accepts every role in STAFF_ROLES", () => {
    for (const role of STAFF_ROLES) expect(isStaffRole(role)).toBe(true);
  });

  it("rejects patient_api and non-string values", () => {
    expect(isStaffRole("patient_api")).toBe(false);
    expect(isStaffRole("god")).toBe(false);
    expect(isStaffRole(42)).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole({})).toBe(false);
  });
});

describe("isAppRole", () => {
  it("accepts staff roles plus patient_api", () => {
    expect(isAppRole("doctor")).toBe(true);
    expect(isAppRole("patient_api")).toBe(true);
    expect(isAppRole("super_admin")).toBe(true);
  });

  it("rejects unknown roles", () => {
    expect(isAppRole("admin")).toBe(false);
    expect(isAppRole("")).toBe(false);
    expect(isAppRole(0)).toBe(false);
  });
});

describe("getClaims", () => {
  it("maps app_metadata claims with type guards", () => {
    const claims = getClaims({
      app_metadata: {
        tenant_id: "t-1",
        branch_id: "b-1",
        role: "pharmacist",
      },
    });
    expect(claims).toEqual({ tenantId: "t-1", branchId: "b-1", role: "pharmacist" });
  });

  it("returns nulls/undefined when metadata is missing or malformed", () => {
    expect(getClaims(null)).toEqual({ tenantId: null, branchId: null, role: undefined });
    expect(getClaims({})).toEqual({ tenantId: null, branchId: null, role: undefined });
    expect(
      getClaims({ app_metadata: { tenant_id: 123, branch_id: true, role: "nope" } })
    ).toEqual({ tenantId: null, branchId: null, role: undefined });
  });

  it("passes through a valid role only", () => {
    const claims = getClaims({ app_metadata: { tenant_id: "t", role: "cashier" } });
    expect(claims.role).toBe("cashier");
    expect(claims.branchId).toBeNull();
  });
});

describe("ROLE_LABELS", () => {
  it("labels every app role", () => {
    for (const role of [...STAFF_ROLES, "patient_api"] as const) {
      expect(typeof ROLE_LABELS[role]).toBe("string");
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });

  it("has human-friendly labels for common roles", () => {
    expect(ROLE_LABELS.hospital_admin).toBe("Hospital Admin");
    expect(ROLE_LABELS.patient_api).toBe("Patient");
    expect(ROLE_LABELS.lab_tech).toBe("Lab Technician");
  });
});

describe("CLINICIAN_ROLES", () => {
  it("contains doctor and excludes admin/patient roles", () => {
    expect(CLINICIAN_ROLES).toContain("doctor");
    expect(CLINICIAN_ROLES).not.toContain("hospital_admin");
    expect(CLINICIAN_ROLES).not.toContain("patient_api");
  });

  it("is a subset of staff roles", () => {
    for (const role of CLINICIAN_ROLES) expect(isStaffRole(role)).toBe(true);
  });
});

describe("ngn", () => {
  it("formats whole naira without decimals", () => {
    expect(ngn(500)).toBe("₦500");
    expect(ngn(0)).toBe("₦0");
  });

  it("rounds to whole naira", () => {
    expect(ngn(1_234_567.89)).toBe("₦1,234,568");
  });

  it("handles negative amounts", () => {
    expect(ngn(-250)).toBe("-₦250");
  });
});

describe("formatDate", () => {
  it("returns a dash for empty input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formats ISO dates in en-NG short style", () => {
    expect(formatDate("2026-08-15")).toBe("15 Aug 2026");
    expect(formatDate(new Date(2026, 0, 1))).toBe("1 Jan 2026");
  });
});

describe("formatTime", () => {
  it("returns a dash for empty input", () => {
    expect(formatTime(null)).toBe("—");
    expect(formatTime(undefined)).toBe("—");
  });

  it("formats HH:MM into locale time", () => {
    expect(formatTime("09:30")).toMatch(/\d{1,2}:\d{2}/);
    expect(formatTime("23:15")).toMatch(/23:15|11:15/);
    expect(formatTime("00:05")).toMatch(/0:05|00:05|12:05/);
  });

  it("returns the raw string when it cannot be parsed", () => {
    expect(formatTime("9am")).toBe("9am");
    expect(formatTime("")).toBe("—");
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words, upper-cased", () => {
    expect(initials("adeolu adesanya")).toBe("AA");
    expect(initials("Adeolu Adesanya")).toBe("AA");
  });

  it("handles single names, empty strings and whitespace", () => {
    expect(initials("Mojisola")).toBe("M");
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });

  it("collapses extra whitespace", () => {
    expect(initials("  taiwo   mafe  ")).toBe("TM");
  });

  it("tolerates non-letter characters", () => {
    expect(initials("O'Neil Baker")).toBe("OB");
    expect(initials("Jean-Luc Picard")).toBe("JP");
  });
});