import { describe, expect, it } from "vitest";
import { validateWith } from "@/lib/schemas";
import { ValidationError } from "@/lib/errors";
import { invoiceCreateSchema } from "@/lib/schemas/invoice-schema";

describe("invoiceCreateSchema", () => {
  it("accepts a valid invoice with items", () => {
    const body = validateWith(invoiceCreateSchema, {
      patientId: "pat-1",
      subtotal: 1000,
      totalAmount: 1075,
      items: [{ description: "Consultation", quantity: 1, unit_price: 1000, total_price: 1000 }],
    });
    expect(body.items).toHaveLength(1);
  });

  it("accepts optional fields and nulls", () => {
    const body = validateWith(invoiceCreateSchema, {
      patientId: "pat-1",
      subtotal: 500,
      totalAmount: 500,
      issueDate: "",
      dueDate: null,
      taxAmount: null,
      discountAmount: 0,
      attendingStaffId: null,
      notes: "",
      status: "pending",
      items: [{ description: "Drugs", quantity: 2, unit_price: 250, vat_percent: null }],
    });
    expect(body.status).toBe("pending");
  });

  it("rejects missing patient/subtotal/total with the route message", () => {
    expect(() =>
      validateWith(invoiceCreateSchema, { subtotal: 1, totalAmount: 1, items: [] })
    ).toThrow("Patient, subtotal and total are required");
    expect(() =>
      validateWith(invoiceCreateSchema, {
        patientId: "pat-1",
        subtotal: null,
        totalAmount: 1,
        items: [],
      })
    ).toThrow(ValidationError);
  });

  it("rejects empty items and bad line values", () => {
    expect(() =>
      validateWith(invoiceCreateSchema, {
        patientId: "pat-1",
        subtotal: 1,
        totalAmount: 1,
        items: [],
      })
    ).toThrow("At least one invoice item is required");
    expect(() =>
      validateWith(invoiceCreateSchema, {
        patientId: "pat-1",
        subtotal: 1,
        totalAmount: 1,
        items: [{ description: " ", quantity: 1, unit_price: 0 }],
      })
    ).toThrow("Each item needs a description, quantity and unit price");
    expect(() =>
      validateWith(invoiceCreateSchema, {
        patientId: "pat-1",
        subtotal: 1,
        totalAmount: 1,
        items: [{ description: "X", quantity: 0, unit_price: 10 }],
      })
    ).toThrow("Each item needs a description, quantity and unit price");
    expect(() =>
      validateWith(invoiceCreateSchema, {
        patientId: "pat-1",
        subtotal: 1,
        totalAmount: 1,
        items: [{ description: "X", quantity: 1, unit_price: -5 }],
      })
    ).toThrow("Each item needs a description, quantity and unit price");
  });

  it("rejects string quantities the route would have rejected via 500", () => {
    expect(() =>
      validateWith(invoiceCreateSchema, {
        patientId: "pat-1",
        subtotal: 1,
        totalAmount: 1,
        items: [{ description: "X", quantity: "1", unit_price: 10 }],
      })
    ).toThrow(ValidationError);
  });
});