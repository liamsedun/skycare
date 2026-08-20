import { describe, expect, it } from "vitest";
import { validateWith } from "@/lib/schemas";
import { ValidationError } from "@/lib/errors";
import { prescriptionCreateSchema } from "@/lib/schemas/prescription-schema";

describe("prescriptionCreateSchema", () => {
  it("accepts a valid prescription with one medication", () => {
    const body = validateWith(prescriptionCreateSchema, {
      patientId: "pat-1",
      doctorId: "doc-1",
      items: [{ medicationName: "Amaryl 1mg", dosage: "1 tablet", frequency: "daily" }],
    });
    expect(body.items[0].medicationName).toBe("Amaryl 1mg");
  });

  it("accepts optional fields and external pharmacy type", () => {
    const body = validateWith(prescriptionCreateSchema, {
      patientId: "pat-1",
      doctorId: "doc-1",
      diagnosis: "",
      notes: null,
      status: "active",
      pharmacyType: "external",
      externalPharmacyName: "MedPlus",
      items: [
        {
          medicationName: "Paracetamol",
          dosage: "2 tablets",
          frequency: "3x daily",
          route: null,
          duration: "5 days",
          quantity: 30,
          refills: 1,
          instructions: "",
        },
      ],
    });
    expect(body.pharmacyType).toBe("external");
    expect(body.items[0].quantity).toBe(30);
  });

  it("rejects missing patient/doctor with the route message", () => {
    expect(() =>
      validateWith(prescriptionCreateSchema, {
        doctorId: "doc-1",
        items: [{ medicationName: "X" }],
      })
    ).toThrow("Patient and doctor are required");
    expect(() =>
      validateWith(prescriptionCreateSchema, {
        patientId: "pat-1",
        items: [{ medicationName: "X" }],
      })
    ).toThrow("Patient and doctor are required");
  });

  it("rejects empty items and blank medication names", () => {
    expect(() =>
      validateWith(prescriptionCreateSchema, { patientId: "p", doctorId: "d", items: [] })
    ).toThrow("At least one medication is required");
    expect(() =>
      validateWith(prescriptionCreateSchema, {
        patientId: "p",
        doctorId: "d",
        items: [{ medicationName: "   ", dosage: "x", frequency: "y" }],
      })
    ).toThrow(ValidationError);
  });
});