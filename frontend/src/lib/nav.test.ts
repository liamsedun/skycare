import { describe, expect, it } from "vitest";
import {
  ALWAYS_VISIBLE_KEYS,
  accessLevelOf,
  MODULE_KEYS,
  NAV_ITEMS,
  navForRole,
} from "@/lib/nav";

describe("accessLevelOf", () => {
  it("returns full for null/undefined access", () => {
    expect(accessLevelOf(null, "pharmacy")).toBe("full");
    expect(accessLevelOf(undefined, "pharmacy")).toBe("full");
  });

  it("defaults missing keys to none when a record exists", () => {
    expect(accessLevelOf({}, "pharmacy")).toBe("none");
    expect(accessLevelOf({ pharmacy: "view_only" }, "lab")).toBe("none");
    expect(accessLevelOf({ pharmacy: "view_only" }, "pharmacy")).toBe("view_only");
  });
});

describe("NAV_ITEMS structure", () => {
  it("has unique keys and hrefs", () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("exposes the expected modules", () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    expect(keys).toEqual(
      expect.arrayContaining(["overview", "appointments", "pharmacy", "lab", "wards", "hr", "payroll"])
    );
  });

  it("modules with children are not themselves grantable duplicates", () => {
    expect(MODULE_KEYS).toContain("pharmacy-inventory");
    expect(MODULE_KEYS).toContain("hr-roster");
    expect(MODULE_KEYS).not.toContain("settings");
    expect(MODULE_KEYS).not.toContain("account");
  });
});

describe("navForRole — role defaults", () => {
  it("returns the full tree for hospital_admin", () => {
    const items = navForRole("hospital_admin", null);
    expect(items.map((i) => i.key)).toEqual(expect.arrayContaining(["pharmacy", "lab", "settings", "payroll"]));
  });

  it("gates role-restricted modules", () => {
    const pharmacist = navForRole("pharmacist", null).map((i) => i.key);
    expect(pharmacist).toContain("pharmacy");
    expect(pharmacist).not.toContain("settings");
    expect(pharmacist).not.toContain("financial-reports");

    const doctor = navForRole("doctor", null).map((i) => i.key);
    expect(doctor).toContain("reports");
    expect(doctor).not.toContain("pharmacy-suppliers");
  });

  it("returns [] for unknown roles", () => {
    expect(navForRole(undefined, null)).toEqual([]);
  });
});

describe("navForRole — custom module access", () => {
  it("lets a grant override hard role lists", () => {
    const granted = { lab: "full", "lab-requests": "full" } as const;
    const pharmacist = navForRole("pharmacist", granted);
    expect(pharmacist.map((i) => i.key)).toContain("lab");
  });

  it("prunes children individually", () => {
    const granted = { pharmacy: "view_only", "pharmacy-inventory": "full", "lab-requests": "view_only" } as const;
    const pharmacist = navForRole("pharmacist", granted);
    const pharmacy = pharmacist.find((i) => i.key === "pharmacy")!;
    const childKeys = pharmacy.children!.map((c) => c.key);
    expect(childKeys).toContain("pharmacy-inventory");
    expect(childKeys).not.toContain("pharmacy-billing");
    expect(childKeys).not.toContain("pharmacy-prices");
  });

  it("keeps system pages role-gated even with a grant map", () => {
    const granted = { lab: "full" } as const;
    const admin = navForRole("hospital_admin", granted);
    expect(admin.map((i) => i.key)).toContain("settings");
    const cashier = navForRole("cashier", granted);
    expect(cashier.map((i) => i.key)).not.toContain("settings");
  });

  it("shows a parent when only a child is granted", () => {
    const granted = { "pharmacy-inventory": "full" } as const;
    const nurse = navForRole("nurse", granted);
    const pharmacy = nurse.find((i) => i.key === "pharmacy");
    expect(pharmacy).toBeDefined();
    expect(pharmacy!.children!.map((c) => c.key)).toEqual(["pharmacy-inventory"]);
  });

  it("hides parents with no visible children and no own grant", () => {
    const granted = { "lab-requests": "none" } as const;
    const nurse = navForRole("nurse", granted);
    expect(nurse.find((i) => i.key === "lab")).toBeUndefined();
  });

  it("empty record hides everything except role-allowed system pages", () => {
    const admin = navForRole("hospital_admin", {});
    const keys = admin.map((i) => i.key);
    expect(keys).not.toContain("pharmacy");
    expect(keys).toContain("settings");
  });

  it("ALWAYS_VISIBLE_KEYS covers the system pages", () => {
    expect([...ALWAYS_VISIBLE_KEYS]).toEqual(["account", "download", "profile", "settings"]);
  });
});