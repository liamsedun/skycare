import { z } from "zod";

export const labRequestItemSchema = z.object({
  serviceId: z.string().nullable().optional(),
  serviceName: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  sampleType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * POST /api/lab-requests — in-house or external-lab request with line items.
 * patientId + a non-empty items array are strict; everything else tolerates
 * null/""/undefined exactly like the old inline checks.
 */
export const labRequestCreateSchema = z.object({
  patientId: z.string({ error: "Patient and at least one service are required" }).trim().min(1, "Patient and at least one service are required"),
  doctorId: z.string().nullable().optional(),
  isExternal: z.boolean().optional(),
  externalLabId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  assignedToIds: z.array(z.string()).nullable().optional(),
  items: z
    .array(labRequestItemSchema)
    .min(1, "Patient and at least one service are required"),
});

export type LabRequestCreateInput = z.infer<typeof labRequestCreateSchema>;