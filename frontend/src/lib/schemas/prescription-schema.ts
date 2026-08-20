import { z } from "zod";

export const prescriptionItemSchema = z.object({
  medicationName: z.string().trim().min(1, "At least one medication is required"),
  drugId: z.string().nullable().optional(),
  pharmacyDrugId: z.string().nullable().optional(),
  dosage: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  refills: z.number().nullable().optional(),
  instructions: z.string().nullable().optional(),
});

/**
 * POST /api/prescriptions — clinical prescription with medication lines.
 * Strict on patientId/doctorId + a non-empty items array; pharmacyType is a
 * free string defaulting to in_house in the route, so it stays loose here.
 */
export const prescriptionCreateSchema = z.object({
  patientId: z.string({ error: "Patient and doctor are required" }).trim().min(1, "Patient and doctor are required"),
  doctorId: z.string({ error: "Patient and doctor are required" }).trim().min(1, "Patient and doctor are required"),
  diagnosis: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  pharmacyType: z.string().nullable().optional(),
  externalPharmacyName: z.string().nullable().optional(),
  items: z.array(prescriptionItemSchema).min(1, "At least one medication is required"),
});

export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>;