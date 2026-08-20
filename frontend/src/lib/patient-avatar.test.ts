// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  parseAvatarDataUrl,
  patientGradient,
  patientInitials,
  PATIENT_GRADIENTS,
  storePatientAvatar,
} from "@/lib/patient-avatar";

describe("patientInitials", () => {
  it("combines the first letters, upper-cased", () => {
    expect(patientInitials("Adeolu", "Adesanya")).toBe("AA");
    expect(patientInitials("taiwo", "mafe")).toBe("TM");
  });

  it("falls back to PT for missing names", () => {
    expect(patientInitials("", "")).toBe("PT");
    expect(patientInitials(undefined as never, undefined as never)).toBe("PT");
  });
});

describe("patientGradient", () => {
  it("always returns a member of PATIENT_GRADIENTS", () => {
    for (const id of ["a", "b", "abc-123", "", "x".repeat(100)]) {
      expect(PATIENT_GRADIENTS).toContain(patientGradient(id));
    }
  });

  it("is stable for the same id", () => {
    expect(patientGradient("p1")).toBe(patientGradient("p1"));
  });
});

describe("parseAvatarDataUrl", () => {
  const sample = Buffer.from("hello world").toString("base64");

  it("parses jpeg/png/webp/gif data URLs", () => {
    for (const ext of ["jpeg", "png", "webp", "gif"]) {
      const { ext: got, buffer } = parseAvatarDataUrl(`data:image/${ext};base64,${sample}`);
      expect(got).toBe(ext);
      expect(buffer.toString()).toBe("hello world");
    }
  });

  it("rejects malformed payloads", () => {
    expect(() => parseAvatarDataUrl("data:image/png;base64,")).toThrow(/Invalid photo data/);
    expect(() => parseAvatarDataUrl("https://not-a-data-url")).toThrow(/Invalid photo data/);
    expect(() => parseAvatarDataUrl("data:image/bmp;base64," + sample)).toThrow(/Invalid photo data/);
  });

  it("rejects empty and oversized payloads", () => {
    expect(() => parseAvatarDataUrl("data:image/jpeg;base64,")).toThrow(/Invalid photo data/);
    expect(() => parseAvatarDataUrl("data:image/jpeg;base64,====")).toThrow(/Empty photo data/);
    const big = Buffer.alloc(3 * 1024 * 1024).toString("base64");
    expect(() => parseAvatarDataUrl(`data:image/jpeg;base64,${big}`)).toThrow(/2 MB or smaller/);
  });
});

describe("storePatientAvatar", () => {
  it("uploads, returns the public URL and rethrows storage errors", async () => {
    const upload = async (_path: string, _buf: Buffer) => ({ error: null });
    const getPublicUrl = () => ({ data: { publicUrl: "https://cdn/avatars/patients/t1/p1-a.png" } });
    const svc = { storage: { from: () => ({ upload, getPublicUrl }) } };
    const url = await storePatientAvatar(
      svc as never,
      "t1",
      "p1",
      `data:image/png;base64,${Buffer.from("x").toString("base64")}`
    );
    expect(url).toBe("https://cdn/avatars/patients/t1/p1-a.png");

    const fail = async () => ({ error: { message: "storage boom" } });
    const badSvc = { storage: { from: () => ({ upload: fail }) } };
    await expect(
      storePatientAvatar(
        badSvc as never,
        "t1",
        "p1",
        `data:image/jpeg;base64,${Buffer.from("hi").toString("base64")}`
      )
    ).rejects.toThrow("storage boom");
  });
});