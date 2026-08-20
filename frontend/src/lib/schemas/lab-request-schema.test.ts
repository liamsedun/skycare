import { describe, expect, it } from "vitest";
import { validateWith } from "@/lib/schemas";
import { ValidationError } from "@/lib/errors";
import { labRequestCreateSchema } from "@/lib/schemas/lab-request-schema";

describe("labRequestCreateSchema", () => {
  it("accepts a valid in-house request with one item", () => {
    const body = validateWith(labRequestCreateSchema, {
      patientId: "pat-1",
      items: [{ serviceId: "svc-1", priority: "urgent" }],
    });
    expect(body.items[0].priority).toBe("urgent");
  });

  it("accepts external-lab requests with notes and assignments", () => {
    const body = validateWith(labRequestCreateSchema, {
      patientId: "pat-1",
      isExternal: true,
      externalLabId: "LAB-X",
      assignedToIds: ["u1", "u2"],
      notes: "",
      items: [{ serviceName: "Malaria RDT", sampleType: null }],
    });
    expect(body.externalLabId).toBe("LAB-X");
    expect(body.assignedToIds).toHaveLength(2);
  });

  it("rejects missing patient or empty items with the route message", () => {
    expect(() =>
      validateWith(labRequestCreateSchema, { items: [{ serviceId: "s1" }] })
    ).toThrow("Patient and at least one service are required");
    expect(() =>
      validateWith(labRequestCreateSchema, { patientId: "pat-1", items: [] })
    ).toThrow("Patient and at least one service are required");
    expect(() =>
      validateWith(labRequestCreateSchema, { patientId: "pat-1" })
    ).toThrow(ValidationError);
  });

  it("rejects non-array items and non-uuid-ish types", () => {
    expect(() =>
      validateWith(labRequestCreateSchema, { patientId: "pat-1", items: "nope" })
    ).toThrow(ValidationError);
    expect(() =>
      validateWith(labRequestCreateSchema, { patientId: 12, items: [{ serviceId: "s1" }] })
    ).toThrow(ValidationError);
  });
});