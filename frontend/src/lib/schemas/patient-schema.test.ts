import { describe, expect, it } from "vitest";
import { validateWith, z } from "@/lib/schemas";
import { ValidationError } from "@/lib/errors";
import { patientCreateSchema } from "@/lib/schemas/patient-schema";

describe("patientCreateSchema", () => {
  it("accepts the minimum valid body and trims names", () => {
    const body = validateWith(patientCreateSchema, {
      firstName: "  Adeolu ",
      lastName: "Adesanya",
    });
    expect(body.firstName).toBe("Adeolu");
    expect(body.lastName).toBe("Adesanya");
  });

  it("accepts every optional field incl. empty strings and nulls", () => {
    const body = validateWith(
      patientCreateSchema,
      {
        firstName: "Ada",
        lastName: "Okafor",
        otherNames: "",
        gender: null,
        dateOfBirth: "",
        phone: "080",
        email: null,
        heightCm: "172",
        weightKg: 65,
        isInsured: false,
        nextOfKin: { name: "Chidi" },
        portalEmail: "ada@qa.com",
        portalPassword: "secret123",
        mustChangePassword: true,
      }
    );
    expect(body.heightCm).toBe("172");
    expect(body.weightKg).toBe(65);
    expect(body.nextOfKin).toEqual({ name: "Chidi" });
  });

  it("rejects a missing or blank first/last name with the route message", () => {
    expect(() => validateWith(patientCreateSchema, { firstName: "  " })).toThrow(
      ValidationError
    );
    expect(() => validateWith(patientCreateSchema, { lastName: "" })).toThrow(
      "First and last name are required"
    );
  });

  it("rejects non-object and non-string values", () => {
    expect(() => validateWith(patientCreateSchema, null)).toThrow(ValidationError);
    expect(() => validateWith(patientCreateSchema, { firstName: 42, lastName: "X" })).toThrow(
      ValidationError
    );
  });
});

describe("validateWith error mapping", () => {
  it("throws the API ValidationError (400 family), never a bare ZodError", () => {
    try {
      validateWith(z.object({ required: z.string().min(1) }), {});
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).status).toBe(400);
    }
  });
});