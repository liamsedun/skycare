import { z } from "zod";

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Each item needs a description, quantity and unit price"),
  quantity: z.number().gt(0, "Each item needs a description, quantity and unit price"),
  unit_price: z.number().gte(0, "Each item needs a description, quantity and unit price"),
  total_price: z.number().optional(),
  vat_percent: z.number().nullable().optional(),
  vat_amount: z.number().nullable().optional(),
});

/**
 * POST /api/invoices — central billing invoice.
 * Mirrors the route's inline checks exactly: patientId + subtotal +
 * totalAmount + a non-empty items array with positive quantity / non-negative
 * unit price.
 */
export const invoiceCreateSchema = z.object({
  patientId: z.string({ error: "Patient, subtotal and total are required" }).trim().min(1, "Patient, subtotal and total are required"),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  subtotal: z.number({ message: "Patient, subtotal and total are required" }),
  taxAmount: z.number().nullable().optional(),
  discountAmount: z.number().nullable().optional(),
  totalAmount: z.number({ message: "Patient, subtotal and total are required" }),
  attendingStaffId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one invoice item is required"),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;