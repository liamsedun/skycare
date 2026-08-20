import { describe, expect, it } from "vitest";
import {
  ageOf,
  fmtDate,
  MAX_DEPENDANTS,
  ngn,
  outstandingOf,
  relInfo,
  relLabel,
  statusOf,
  type FamilyMember,
} from "@/lib/patient-family-shared";

const member = (over: Partial<FamilyMember> = {}): FamilyMember =>
  ({
    id: "p1",
    patient_number: "PT-0001",
    first_name: "Adeolu",
    last_name: "Adesanya",
    gender: "male",
    date_of_birth: "1990-04-12",
    phone: null,
    email: null,
    address: null,
    city: null,
    state: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    blood_group: "O+",
    genotype: "AA",
    allergies: null,
    chronic_conditions: null,
    dependant_relationship: null,
    is_primary_account: true,
    primary_account_id: null,
    user_id: null,
    marital_status: null,
    status: "active",
    avatar_url: null,
    created_at: "2026-08-01T10:00:00Z",
    ...over,
  }) as FamilyMember;

describe("relInfo / relLabel", () => {
  it("maps relationships case-insensitively", () => {
    expect(relInfo("Child").label).toBe("Child");
    expect(relInfo("SPOUSE").label).toBe("Spouse");
    expect(relLabel("sibling ")).toBe("Sibling");
    expect(relLabel("grandparent")).toBe("Grandparent");
  });

  it("falls back to 'Other' for unknown or empty values", () => {
    expect(relLabel("cousin")).toBe("Other");
    expect(relLabel("")).toBe("Other");
    expect(relLabel(null)).toBe("Other");
    expect(relLabel(undefined)).toBe("Other");
  });
});

describe("ageOf", () => {
  it("computes whole years from DOB", () => {
    expect(ageOf("1990-04-12")).toBe("36 yr");
  });

  it("returns null for missing or invalid dates", () => {
    expect(ageOf(null)).toBeNull();
    expect(ageOf("not-a-date")).toBeNull();
  });
});

describe("fmtDate", () => {
  it("formats valid dates with the local locale", () => {
    const out = fmtDate("2026-08-15T09:00:00Z");
    expect(out).toContain("2026");
    expect(out).toContain("Aug");
  });

  it("returns a dash for missing or invalid input", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("garbage")).toBe("—");
    expect(fmtDate("")).toBe("—");
  });
});

describe("ngn", () => {
  it("formats naira with up to two decimals", () => {
    expect(ngn(1_500)).toBe("₦1,500");
    expect(ngn(1_500.5)).toBe("₦1,500.5");
    expect(ngn(null)).toBe("₦0");
    expect(ngn(undefined)).toBe("₦0");
  });
});

describe("statusOf", () => {
  it("flags needs_attention when money is owing or allergies exist", () => {
    expect(statusOf(member(), 0)).toBe("active");
    expect(statusOf(member(), 50)).toBe("needs_attention");
    expect(statusOf(member(), 0.005)).toBe("active"); // sub-cent rounding tolerance
    expect(statusOf(member({ allergies: "Penicillin" }), 0)).toBe("needs_attention");
  });
});

describe("outstandingOf", () => {
  it("sums only pending and partially-paid invoices", () => {
    const invoices = [
      { total_amount: 1_000, paid_amount: 400, status: "partially_paid" },
      { total_amount: 500, paid_amount: 0, status: "pending" },
      { total_amount: 2_000, paid_amount: 2_000, status: "paid" },
      { total_amount: 700, paid_amount: 0, status: "cancelled" },
    ];
    expect(outstandingOf(invoices)).toBe(1_100);
  });

  it("returns 0 for empty lists or all-paid invoices", () => {
    expect(outstandingOf([])).toBe(0);
    expect(outstandingOf([{ total_amount: 10, paid_amount: 10, status: "paid" }])).toBe(0);
  });

  it("coerces string money values", () => {
    const invoices = [{ total_amount: "1000", paid_amount: "250", status: "pending" }] as unknown as Array<{
      total_amount: number;
      paid_amount: number;
      status: string;
    }>;
    expect(outstandingOf(invoices)).toBe(750);
  });
});

describe("MAX_DEPENDANTS", () => {
  it("caps dependants at five", () => {
    expect(MAX_DEPENDANTS).toBe(5);
  });
});