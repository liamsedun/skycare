import { z } from "zod";

/**
 * POST /api/patients — register a patient (staff).
 * Loose by design: every optional field tolerates null/"" (the UI sends
 * empty strings for untouched inputs) and height/weight arrive as either
 * numbers or strings from the form. Only the fields the route actually
 * requires are strict.
 */
export const patientCreateSchema = z.object({
  firstName: z.string({ error: "First and last name are required" }).trim().min(1, "First and last name are required"),
  lastName: z.string({ error: "First and last name are required" }).trim().min(1, "First and last name are required"),
  otherNames: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  bloodGroup: z.string().nullable().optional(),
  genotype: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  heightCm: z.union([z.string(), z.number()]).nullable().optional(),
  weightKg: z.union([z.string(), z.number()]).nullable().optional(),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  chronicConditions: z.string().nullable().optional(),
  nhiaNumber: z.string().nullable().optional(),
  insuranceProvider: z.string().nullable().optional(),
  insurancePlan: z.string().nullable().optional(),
  isInsured: z.boolean().optional(),
  nextOfKin: z.record(z.string(), z.unknown()).nullable().optional(),
  portalEmail: z.string().nullable().optional(),
  portalPassword: z.string().nullable().optional(),
  mustChangePassword: z.boolean().optional(),
});

export type PatientCreateInput = z.infer<typeof patientCreateSchema>;