import { describe, expect, it } from "vitest";
import { validateWith } from "@/lib/schemas";
import { ValidationError } from "@/lib/errors";
import { appointmentCreateSchema } from "@/lib/schemas/appointment-schema";

describe("appointmentCreateSchema", () => {
  it("accepts a valid booking and trims required fields", () => {
    const body = validateWith(appointmentCreateSchema, {
      patientId: "pat-1",
      scheduledDate: " 2026-08-20 ",
      startTime: "09:00",
    });
    expect(body.scheduledDate).toBe("2026-08-20");
  });

  it("accepts optional fields incl. empty strings and nulls", () => {
    const body = validateWith(appointmentCreateSchema, {
      patientId: "pat-1",
      scheduledDate: "2026-08-20",
      startTime: "09:00",
      doctorId: null,
      endTime: "",
      type: "consultation",
      status: "scheduled",
      reason: null,
      notes: "",
    });
    expect(body.type).toBe("consultation");
    expect(body.status).toBe("scheduled");
  });

  it("rejects missing patient/date/time with the route message", () => {
    expect(() =>
      validateWith(appointmentCreateSchema, { scheduledDate: "2026-08-20", startTime: "09:00" })
    ).toThrow("Patient, date and start time are required");
    expect(() =>
      validateWith(appointmentCreateSchema, { patientId: "pat-1", startTime: "09:00" })
    ).toThrow("Patient, date and start time are required");
    expect(() =>
      validateWith(appointmentCreateSchema, { patientId: "pat-1", scheduledDate: "2026-08-20" })
    ).toThrow("Patient, date and start time are required");
  });

  it("rejects blank required values after trim", () => {
    expect(() =>
      validateWith(appointmentCreateSchema, {
        patientId: "pat-1",
        scheduledDate: "2026-08-20",
        startTime: "   ",
      })
    ).toThrow(ValidationError);
  });
});