import { describe, expect, it } from "vitest";
import {
  DEFAULT_TENANT_SETTINGS,
  generateInvoiceNumber,
  generatePatientNumber,
  generateStaffNumber,
  getTenantSettings,
  normalizePrefix,
  PREFIX_PATTERN,
} from "@/lib/tenant-settings";

function thenable(payload: unknown) {
  const chain = {
    then: (res: (v: unknown) => void) => Promise.resolve(payload).then(res),
    catch: undefined,
    finally: undefined,
  };
  for (const m of ["from", "select", "eq", "in", "maybeSingle", "count"]) {
    (chain as Record<string, unknown>)[m] = () => chain;
  }
  return chain as unknown as Promise<typeof payload>;
}

function svcStub(settings: unknown) {
  return {
    from: (table: string) => {
      if (table === "tenants") {
        return thenable({ data: { settings } });
      }
      const count = table === "patients" ? 41 : table === "staff" ? 12 : 7;
      return thenable({ count });
    },
  };
}

describe("normalizePrefix", () => {
  it("appends a dash when missing", () => {
    expect(normalizePrefix("PT")).toBe("PT-");
    expect(normalizePrefix(" QA ")).toBe("QA-");
  });

  it("leaves existing dashes alone", () => {
    expect(normalizePrefix("PT-")).toBe("PT-");
    expect(normalizePrefix("B2-")).toBe("B2-");
  });
});

describe("PREFIX_PATTERN", () => {
  it("accepts lowercase, digits, dashes, underscores and spaces up to 12 chars", () => {
    expect(PREFIX_PATTERN.test("pt-")).toBe(true);
    expect(PREFIX_PATTERN.test("AB_CD-12")).toBe(true);
    expect(PREFIX_PATTERN.test("a b")).toBe(true);
  });

  it("rejects long, empty or symbol-laden prefixes", () => {
    expect(PREFIX_PATTERN.test("1234567890123")).toBe(false);
    expect(PREFIX_PATTERN.test("")).toBe(false);
    expect(PREFIX_PATTERN.test("P@T")).toBe(false);
    expect(PREFIX_PATTERN.test("№")).toBe(false);
  });
});

describe("getTenantSettings", () => {
  it("applies defaults when settings are missing", async () => {
    const settings = await getTenantSettings(svcStub(null) as never, "t1");
    expect(settings).toEqual(DEFAULT_TENANT_SETTINGS);
  });

  it("normalizes valid prefixes and keeps booleans/strings", async () => {
    const settings = await getTenantSettings(
      svcStub({ patientPrefix: "LPH", staffPrefix: "STF-", labAutoFill: true, smsProvider: "twilio" }) as never,
      "t1"
    );
    expect(settings.patientPrefix).toBe("LPH-");
    expect(settings.staffPrefix).toBe("STF-");
    expect(settings.labAutoFill).toBe(true);
    expect(settings.smsProvider).toBe("twilio");
  });

  it("falls back per-key when a prefix is invalid", async () => {
    const settings = await getTenantSettings(
      svcStub({ patientPrefix: "too-long-prefix!", invoicePrefix: 42 }) as never,
      "t1"
    );
    expect(settings.patientPrefix).toBe(DEFAULT_TENANT_SETTINGS.patientPrefix);
    expect(settings.invoicePrefix).toBe(DEFAULT_TENANT_SETTINGS.invoicePrefix);
  });
});

describe("number generators", () => {
  it("pads the count to four digits", async () => {
    expect(await generatePatientNumber(svcStub(null) as never, "t1", "PT-")).toBe("PT-0042");
    expect(await generateStaffNumber(svcStub(null) as never, "t1", "STF-")).toBe("STF-0013");
    expect(await generateInvoiceNumber(svcStub(null) as never, "t1", "INV-")).toBe("INV-0008");
  });

  it("falls back to 0001 when the count is null", async () => {
    const stub = { from: () => thenable({ count: null }) };
    expect(await generatePatientNumber(stub as never, "t1", "PT-")).toBe("PT-0001");
  });
});