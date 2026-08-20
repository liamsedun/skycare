import { z } from "zod";

/**
 * POST /api/appointments — patient or staff booking.
 * Strict on patientId/scheduledDate/startTime (the route's existing checks),
 * loose everywhere else (the portal + staff forms send empty strings for
 * untouched optional inputs).
 */
export const appointmentCreateSchema = z.object({
  patientId: z.string({ error: "Patient, date and start time are required" }).trim().min(1, "Patient, date and start time are required"),
  doctorId: z.string().nullable().optional(),
  scheduledDate: z.string({ error: "Patient, date and start time are required" }).trim().min(1, "Patient, date and start time are required"),
  startTime: z.string({ error: "Patient, date and start time are required" }).trim().min(1, "Patient, date and start time are required"),
  endTime: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;