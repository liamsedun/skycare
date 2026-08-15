import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyInvoiceIssued } from "@/lib/notify";

// Shared pharmacy billing helpers: central-ledger mirroring and automatic
// invoicing of prescriptions when they are fully dispensed.

interface PharmacyInvoiceRow {
  id: string;
  branch_id: string | null;
  patient_id: string | null;
  invoice_number: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  insurance_claimable: boolean;
  notes: string | null;
  synced_invoice_id?: string | null;
}

// Mirror a pharmacy invoice into the central invoices ledger so cashier
// billing dashboards and the patient portal see pharmacy charges under one
// ledger. Best effort: bails silently when there is no patient or the mirror
// insert fails (the pharmacy invoice itself is already committed).
export async function mirrorPharmacyInvoiceToCentral(
  svc: SupabaseClient,
  tenantId: string,
  invoice: PharmacyInvoiceRow,
  actorId: string
): Promise<string | null> {
  if (!invoice.patient_id || invoice.synced_invoice_id) return null;

  const { data: central, error: syncError } = await svc
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      branch_id: invoice.branch_id ?? null,
      patient_id: invoice.patient_id,
      invoice_number: `CPX-${invoice.invoice_number}`.replace(/^CPX-PHX-/, "CPX-"),
      issue_date: new Date().toISOString().slice(0, 10),
      status: "pending",
      subtotal: Number(invoice.subtotal),
      tax_amount: Number(invoice.tax_amount),
      discount_amount: Number(invoice.discount_amount),
      total_amount: Number(invoice.total_amount),
      paid_amount: 0,
      insurance_claimable: invoice.insurance_claimable,
      notes: invoice.notes,
      created_by: actorId,
      attending_staff_id: actorId,
    })
    .select("id")
    .single();

  if (syncError || !central) return null;

  // Copy the line items so the patient portal and central billing show the
  // drugs that were sold (not just the header totals).
  const { data: soldItems } = await svc
    .from("pharmacy_invoice_items")
    .select("drug_name, quantity, unit_price, total_price")
    .eq("invoice_id", invoice.id);
  if (soldItems && soldItems.length > 0) {
    await svc.from("invoice_items").insert(
      soldItems.map((it) => ({
        invoice_id: central.id,
        description: it.drug_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        vat_percent: 0,
        vat_amount: 0,
      }))
    );
  }

  await svc
    .from("pharmacy_invoices")
    .update({ synced_invoice_id: central.id })
    .eq("id", invoice.id);

  // The patient's portal account (and the family root) learns about the bill.
  await notifyInvoiceIssued(svc, tenantId, invoice.patient_id, central.id, invoice.invoice_number, Number(invoice.total_amount));

  return central.id;
}

export interface PrescriptionForInvoice {
  id: string;
  branch_id: string | null;
  patient_id: string | null;
  pharmacy_type?: string;
}

export interface InvoiceLineSource {
  pharmacy_drug_id: string | null;
  quantity: number;
}

// Create a pharmacy invoice for a fully dispensed prescription. Idempotent:
// if an (uncancelled) invoice already exists for the prescription, nothing is
// created. Only items linked to catalog drugs are billable — free-text
// medication rows are skipped. Prices resolve through effective_drug_price
// (branch override -> unit -> wholesale). Returns null when there is nothing
// to bill or the prescription was already invoiced.
export async function createPrescriptionInvoice(
  svc: SupabaseClient,
  tenantId: string,
  rx: PrescriptionForInvoice,
  items: InvoiceLineSource[],
  actorId: string,
  branchId?: string | null
): Promise<{ id: string; invoice_number: string; total_amount: number } | null> {
  const lines = items.filter((i) => i.pharmacy_drug_id && Math.floor(Number(i.quantity) || 0) > 0);
  if (lines.length === 0) return null;

  const { data: existing } = await svc
    .from("pharmacy_invoices")
    .select("id")
    .eq("prescription_id", rx.id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existing) return null;

  const { data: invoiceId, error } = await svc.rpc("pharmacy_invoice_create", {
    p_tenant_id: tenantId,
    p_branch_id: branchId ?? rx.branch_id ?? null,
    p_patient_id: rx.patient_id ?? null,
    p_visit_id: null,
    p_source: "prescription",
    p_items: lines.map((i) => ({
      drug_id: i.pharmacy_drug_id,
      quantity: Math.floor(Number(i.quantity) || 0),
      unit_price: null,
    })),
    p_discount: 0,
    p_tax_rate: 0,
    p_prescription_id: rx.id,
    p_claimable: false,
    p_notes: "Auto-generated on full dispense",
    p_created_by: actorId,
  });
  if (error) throw new Error(error.message);

  const { data: invoice } = await svc
    .from("pharmacy_invoices")
    .select(
      "id, branch_id, patient_id, invoice_number, subtotal, tax_amount, discount_amount, total_amount, insurance_claimable, notes, synced_invoice_id"
    )
    .eq("id", invoiceId)
    .single();
  if (!invoice) throw new Error("Invoice created but could not be loaded");

  await mirrorPharmacyInvoiceToCentral(svc, tenantId, invoice, actorId);

  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    total_amount: Number(invoice.total_amount),
  };
}