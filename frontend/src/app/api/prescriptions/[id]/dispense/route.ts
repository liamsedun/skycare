import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { generatePrescriptionPdf } from "@/lib/prescription-pdf";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, pharmacy_type, dispensed_at, dispensed_by, issued_date, created_at, patients(id, patient_number, first_name, last_name), prescription_items(id, drug_id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

async function getPrescription(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("prescriptions")
    .select(RX_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

interface DispenseItem {
  itemId: string;
  batchId: string | null; // pharmacy_stock_batches id (null -> external/no stock tracking borrow)
  dispensedQty: number;
}

// POST /api/prescriptions/[id]/dispense — pharmacist dispenses one or more
// items. Moves stock from pharmacy_stock_batches via pharmacy_stock_movements
// (the apply trigger decrements the batch, the expired-dispatch guard rejects
// expired batches, low-stock notifications fire automatically). Every action
// is written to dispensing_logs; dispensed_qty is incremented on each item and
// the prescription status is derived (all items complete -> dispensed, partial
// -> partial / pending). External pharmacy prescriptions skip stock moves but
// still log the dispense event for the clinical record.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").at(-2)!;
  const rx = await getPrescription(ctx, id, tenantId);
  if (!rx) throw new ValidationError("Prescription not found");

  const body = (await req.json()) as { items: DispenseItem[]; notes?: string };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("No items to dispense");
  }
  if (!["pending", "processing", "partial"].includes(rx.status)) {
    throw new ValidationError(`Cannot dispense a prescription in status "${rx.status}"`);
  }

  const itemsById = new Map((rx.prescription_items as any[]).map((i: any) => [i.id, i]));
  const done: Array<{ itemId: string; batchId: string | null; dispensedQty: number; drugId: string | null; pharmacyDrugId: string | null; medicationName: string | null; quantity: number }> = [];

  // 1) Validate the request against items + physical stock
  const batchIds = Array.from(new Set(body.items.map((i) => i.batchId).filter(Boolean))) as string[];
  const batches = new Map<string, any>();
  if (batchIds.length > 0) {
    const { data } = await ctx.svc
      .from("pharmacy_stock_batches")
      .select("id, drug_id, branch_id, batch_number, expiry_date, quantity_on_hand")
      .in("id", batchIds)
      .eq("tenant_id", tenantId);
    for (const b of data ?? []) batches.set(b.id, b);
  }

  for (const reqItem of body.items) {
    const item = itemsById.get(reqItem.itemId);
    if (!item) throw new ValidationError(`Item ${reqItem.itemId} does not belong to this prescription`);
    const qty = Math.max(0, Math.floor(Number(reqItem.dispensedQty) || 0));
    if (qty <= 0) continue;
    const remaining = item.quantity - item.dispensed_qty;
    if (qty > remaining) {
      throw new ValidationError(`Cannot dispense ${qty} of "${item.medication_name ?? "item"}": only ${remaining} remain on the prescription`);
    }

    let batch: any = null;
    if (reqItem.batchId) {
      batch = batches.get(reqItem.batchId);
      if (!batch) throw new ValidationError(`Stock batch ${reqItem.batchId} not found`);
      if (item.pharmacy_drug_id && batch.drug_id !== item.pharmacy_drug_id) {
        throw new ValidationError(`Batch ${batch.batch_number} is for a different medication than "${item.medication_name}"`);
      }
      if (batch.quantity_on_hand < qty) {
        throw new ValidationError(`Insufficient stock of "${item.medication_name}" (batch ${batch.batch_number} has ${batch.quantity_on_hand})`);
      }
    }
    done.push({ itemId: item.id, batchId: reqItem.batchId ?? null, dispensedQty: qty, drugId: item.drug_id, pharmacyDrugId: item.pharmacy_drug_id, medicationName: item.medication_name, quantity: item.quantity });
  }
  if (done.length === 0) throw new ValidationError("Nothing to dispense");

  // 2) Move stock (per affected item) — dispense movements decrement the batch
  //    through the 0023 apply-movement trigger; expired batches rejected there.
  for (const d of done) {
    if (d.batchId) {
      const batch = batches.get(d.batchId);
      const { error: mvError } = await ctx.svc.from("pharmacy_stock_movements").insert({
        tenant_id: tenantId,
        drug_id: batch.drug_id,
        batch_id: batch.id,
        branch_id: batch.branch_id,
        type: "dispense",
        quantity: d.dispensedQty,
        source_ref: id,
        notes: body.notes?.trim() || null,
        created_by: ctx.user.id,
      });
      if (mvError) {
        // exhausted batch or race — surface the exact SQL message
        throw new ValidationError(`Stock move failed: ${mvError.message}`);
      }
    }

    const { error: logError } = await ctx.svc.from("dispensing_logs").insert({
      tenant_id: tenantId,
      prescription_id: id,
      item_id: d.itemId,
      batch_id: d.batchId,
      branch_id: batches.get(d.batchId ?? "")?.branch_id ?? ctx.branchId ?? null,
      quantity: d.dispensedQty,
      dispensed_by: ctx.user.id,
      notes: body.notes?.trim() || null,
    });
    if (logError) throw new ValidationError(`Dispensing log failed: ${logError.message}`);
  }

  // 3) Increment dispensed_qty per item and derive status
  for (const d of done) {
    const { error: uErr } = await ctx.svc
      .from("prescription_items")
      .update({ dispensed_qty: d.dispensedQty + (itemsById.get(d.itemId)?.dispensed_qty ?? 0) })
      .eq("id", d.itemId)
      .eq("prescription_id", id);
    if (uErr) throw new ValidationError(uErr.message);
  }

  const { data: itemsAfter } = await ctx.svc
    .from("prescription_items")
    .select("quantity, dispensed_qty")
    .eq("prescription_id", id);
  const total = itemsAfter?.length ?? 0;
  const allDispensed = total > 0 && itemsAfter!.every((i) => i.dispensed_qty >= i.quantity);
  const someDispensed = itemsAfter!.some((i) => i.dispensed_qty > 0);
  const newStatus = allDispensed ? "dispensed" : someDispensed ? "partial" : "pending";

  const { data: updated, error: stErr } = await ctx.svc
    .from("prescriptions")
    .update({ status: newStatus, dispensed_at: new Date().toISOString(), dispensed_by: ctx.user.id })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (stErr) throw new ValidationError(stErr.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "prescriptions",
    entityId: id,
    description: `Dispensed ${done.length} item(s) — status ${newStatus} (${someDispensed ? "part-" : ""}filled)`,
  });

  // 4) Fully dispensed prescriptions get their PDF generated automatically.
  if (newStatus === "dispensed") {
    try {
      await generatePrescriptionPdf(ctx.svc, tenantId, id, req.nextUrl.origin);
    } catch (e) {
      // best-effort: the dispense itself already succeeded
      console.error("prescription-pdf auto-generate failed", e);
    }
  }

  return ok(updated);
});

export const runtime = "nodejs";