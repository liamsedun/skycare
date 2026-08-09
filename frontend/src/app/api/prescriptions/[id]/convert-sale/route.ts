import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { generatePrescriptionPdf } from "@/lib/prescription-pdf";
import { mirrorPharmacyInvoiceToCentral } from "@/lib/pharmacy-billing";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, pharmacy_type, dispensed_at, dispensed_by, issued_date, created_at, patients(id, patient_number, first_name, last_name), users!prescriptions_doctor_id_fkey(id, full_name), prescription_items(id, drug_id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

async function getPrescription(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("prescriptions")
    .select(RX_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

interface BatchRow {
  id: string;
  drug_id: string;
  branch_id: string | null;
  batch_number: string;
  expiry_date: string | null;
  quantity_on_hand: number;
}

// POST /api/prescriptions/[id]/convert-sale — pharmacy staff convert a pending
// prescription into a NEW SALE from Billing & Sales:
//
//   channel = "in_house" — issue the medication (stock deducted), raise the
//             invoice in the patient's name; payment is left outstanding
//             (tracked on their account).
//   channel = "walk_in"  — same stock issue + invoice, but billed to no
//             patient; the cashier collects payment instantly (cash/transfer)
//             so the invoice is paid and the bank ledger credited.
//   channel = "external" — no stock, no invoice: the prescription is closed
//             and the patient receives Internal Mail with the medication list
//             to buy at their preferred pharmacy.
//
// Stock is drawn FEFO (earliest-expiring batch first) — the same movement
// path as /dispense (pharmacy_stock_movements trigger decrements batches and
// guards expired stock). The invoice is raised BEFORE stock moves so a stock
// failure cancels the invoice instead of leaving a phantom sale; a pre-flight
// shortage check rejects the whole conversion up front.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").at(-2)!;
  const rx = await getPrescription(ctx, id, tenantId);
  if (!rx) throw new NotFoundError("Prescription not found");

  const body = (await req.json()) as { channel?: string; notes?: string };
  const channel = body.channel;
  if (channel !== "in_house" && channel !== "walk_in" && channel !== "external") {
    throw new ValidationError('Channel must be "in_house", "walk_in" or "external"');
  }
  if (!["pending", "processing", "partial"].includes(rx.status)) {
    throw new ValidationError(`Cannot convert a prescription in status "${rx.status}"`);
  }

  const items = (rx.prescription_items ?? []) as Array<{
    id: string;
    drug_id: string | null;
    pharmacy_drug_id: string | null;
    medication_name: string | null;
    quantity: number;
    dispensed_qty: number;
  }>;

  // ---------------- EXTERNAL PHARMACY: close + mail the medication list ----
  if (channel === "external") {
    const { error: stErr } = await ctx.svc
      .from("prescriptions")
      .update({ status: "completed" })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (stErr) throw new ValidationError(stErr.message);

    await ctx.svc.rpc("notify_prescription_event", {
      p_prescription_id: id,
      p_event: "closed",
    });

    await logAudit(req, ctx, {
      action: "update",
      entityType: "prescriptions",
      entityId: id,
      description: `Prescription closed as external-pharmacy sale (${items.length} item(s) mailed to patient)`,
    });

    return ok({ status: "completed", channel, convertedTo: "external" });
  }

  // ---------------- IN-HOUSE / WALK-IN: issue stock + raise invoice --------
  const billable = items
    .map((i) => ({
      ...i,
      remaining: Math.max(0, Math.floor(Number(i.quantity) || 0) - Math.floor(Number(i.dispensed_qty) || 0)),
    }))
    .filter((i) => i.remaining > 0);
  if (billable.length === 0) {
    throw new ValidationError("This prescription has nothing left to convert (already dispensed)");
  }

  // 1) Pre-flight stock — FEFO queues per drug, fail fast on shortage
  const drugIds = Array.from(new Set(billable.map((i) => i.pharmacy_drug_id).filter(Boolean))) as string[];
  const { data: batchRows } = await ctx.svc
    .from("pharmacy_stock_batches")
    .select("id, drug_id, branch_id, batch_number, expiry_date, quantity_on_hand")
    .in("drug_id", drugIds)
    .eq("tenant_id", tenantId)
    .gt("quantity_on_hand", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("batch_number", { ascending: true });

  const queueByDrug = new Map<string, BatchRow[]>();
  for (const b of (batchRows ?? []) as BatchRow[]) {
    const q = queueByDrug.get(b.drug_id) ?? [];
    q.push(b);
    queueByDrug.set(b.drug_id, q);
  }

  const allocations: Array<{ itemId: string; drugId: string | null; batch: BatchRow; qty: number }> = [];
  const shortages: string[] = [];
  for (const b of billable) {
    if (!b.pharmacy_drug_id) continue;
    let need = b.remaining;
    const queue = queueByDrug.get(b.pharmacy_drug_id) ?? [];
    const avail = queue.reduce((s, x) => s + x.quantity_on_hand, 0);
    if (avail < need) {
      shortages.push(`${b.medication_name ?? "item"}: have ${avail}, need ${need}`);
      continue;
    }
    for (const batch of queue) {
      if (need <= 0) break;
      const take = Math.min(need, batch.quantity_on_hand);
      if (take > 0) {
        allocations.push({ itemId: b.id, drugId: b.pharmacy_drug_id, batch, qty: take });
        need -= take;
        batch.quantity_on_hand -= take;
      }
    }
  }
  if (shortages.length > 0) {
    throw new ValidationError(`Insufficient stock — ${shortages.join(" · ")}`);
  }

  // 2) Invoice FIRST (draft until paid) — no patient for walk-in sales
  const { data: existingInvoice } = await ctx.svc
    .from("pharmacy_invoices")
    .select("id")
    .eq("prescription_id", id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (existingInvoice) {
    throw new ValidationError("This prescription already has a pharmacy invoice");
  }

  const { data: invoiceId, error: invError } = await ctx.svc.rpc("pharmacy_invoice_create", {
    p_tenant_id: tenantId,
    p_branch_id: rx.branch_id ?? null,
    p_patient_id: channel === "walk_in" ? null : rx.patient_id,
    p_visit_id: null,
    p_source: "prescription",
    p_items: billable
      .filter((i) => i.pharmacy_drug_id)
      .map((i) => ({ drug_id: i.pharmacy_drug_id, quantity: i.remaining, unit_price: null })),
    p_discount: 0,
    p_tax_rate: 0,
    p_prescription_id: id,
    p_claimable: false,
    p_notes: `Converted from prescription (${channel})` + (body.notes?.trim() ? ` — ${body.notes.trim()}` : ""),
    p_created_by: ctx.user.id,
  });
  if (invError) throw new ValidationError(invError.message);

  async function cancelInvoice() {
    await ctx.svc.from("pharmacy_invoices").update({ status: "cancelled" }).eq("id", invoiceId);
  }

  // 3) Move stock + log dispensing (on failure: cancel the invoice, never a
  //    phantom sale), then mark every item fully dispensed.
  try {
    for (const a of allocations) {
      const { error: mvError } = await ctx.svc.from("pharmacy_stock_movements").insert({
        tenant_id: tenantId,
        drug_id: a.drugId,
        batch_id: a.batch.id,
        branch_id: a.batch.branch_id,
        type: "dispense",
        quantity: a.qty,
        source_ref: id,
        notes: body.notes?.trim() || null,
        created_by: ctx.user.id,
      });
      if (mvError) throw new ValidationError(`Stock move failed: ${mvError.message}`);
    }
    for (const item of items) {
      if (Math.floor(Number(item.quantity) || 0) <= 0) continue;
      const { error: logError } = await ctx.svc.from("dispensing_logs").insert({
        tenant_id: tenantId,
        prescription_id: id,
        item_id: item.id,
        batch_id: allocations.find((a) => a.itemId === item.id)?.batch.id ?? null,
        branch_id: allocations.find((a) => a.itemId === item.id)?.batch.branch_id ?? rx.branch_id ?? null,
        quantity: Math.floor(Number(item.quantity) || 0),
        dispensed_by: ctx.user.id,
        notes: `Converted to ${channel} sale` + (body.notes?.trim() ? ` — ${body.notes.trim()}` : ""),
      });
      if (logError) throw new ValidationError(`Dispensing log failed: ${logError.message}`);

      const { error: uErr } = await ctx.svc
        .from("prescription_items")
        .update({ dispensed_qty: item.quantity })
        .eq("id", item.id)
        .eq("prescription_id", id);
      if (uErr) throw new ValidationError(uErr.message);
    }
  } catch (e) {
    await cancelInvoice();
    throw e;
  }

  const newStatus = "dispensed";
  const { data: updated, error: stErr } = await ctx.svc
    .from("prescriptions")
    .update({ status: newStatus, dispensed_at: new Date().toISOString(), dispensed_by: ctx.user.id })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("id, status, dispensed_at, dispensed_by")
    .single();
  if (stErr) throw new ValidationError(stErr.message);

  // 4) Best-effort extras: PDF for the record, patient mail, central-ledger
  //    mirror (walk-in sales have no patient so nothing is mirrored).
  let invoice: any = null;
  try {
    const { data: inv } = await ctx.svc
      .from("pharmacy_invoices")
      .select("id, branch_id, patient_id, invoice_number, subtotal, tax_amount, discount_amount, total_amount, insurance_claimable, notes, synced_invoice_id")
      .eq("id", invoiceId)
      .single();
    invoice = inv;
    if (rx.patient_id) await generatePrescriptionPdf(ctx.svc, tenantId, id, req.nextUrl.origin);
    await ctx.svc.rpc("notify_prescription_event", {
      p_prescription_id: id,
      p_event: "dispensed",
    });
    if (inv) await mirrorPharmacyInvoiceToCentral(ctx.svc, tenantId, inv, ctx.user.id);
  } catch (e) {
    console.error("convert-sale extras failed", e);
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "pharmacy_invoices",
    entityId: invoice?.id,
    description: `Prescription ${id} converted to ${channel} sale — invoice ${invoice?.invoice_number ?? ""} ₦${(
      Number(invoice?.total_amount) ?? 0
    ).toLocaleString()}, stock issued`,
  });

  return ok({
    status: newStatus,
    channel,
    convertedTo: channel === "walk_in" ? "walk_in" : "in_house",
    invoice: invoice
      ? {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          total_amount: Number(invoice.total_amount),
          patient_id: invoice.patient_id,
        }
      : null,
  });
});

export const runtime = "nodejs";