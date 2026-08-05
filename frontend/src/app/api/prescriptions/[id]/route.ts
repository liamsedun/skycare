import { withAuth, withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, diagnosis, notes, status, issued_date, expires_date, created_at, updated_at, patients(id, patient_number, first_name, last_name), users(id, full_name, role), prescription_items(id, drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

async function getPrescription(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("prescriptions")
    .select(RX_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/prescriptions/[id]
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const rx = await getPrescription(ctx, id, tenantId);
  if (!rx) throw new NotFoundError("Prescription not found");
  if (ctx.role === "patient_api") {
    const { data } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id);
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id);
      if (row.primary_account_id) ids.add(row.primary_account_id);
    }
    if (!ids.has(rx.patient_id)) throw new NotFoundError("Prescription not found");
  }
  await logView(req, ctx, "prescriptions", id, `Viewed prescription for patient`);
  return ok(rx);
});

// PUT /api/prescriptions/[id] — status + notes; items replace when provided
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getPrescription(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Prescription not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = ["diagnosis", "notes", "status", "expires_date"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }
  if (patch.status && !["active", "completed", "cancelled", "dispensed", "partially_dispensed"].includes(patch.status as string)) {
    throw new ValidationError("Invalid prescription status");
  }

  // Pharmacist dispense: update dispensed quantities per item
  if (Array.isArray(body.dispenseItems)) {
    for (const item of body.dispenseItems as Array<{ id: string; dispensedQty: number }>) {
      const { error: itemError } = await ctx.svc
        .from("prescription_items")
        .update({ dispensed_qty: Math.max(0, Math.floor(Number(item.dispensedQty) || 0)) })
        .eq("id", item.id)
        .eq("prescription_id", id);
      if (itemError) throw new ValidationError(itemError.message);
    }
    const { data: items, error: itemsError } = await ctx.svc
      .from("prescription_items")
      .select("quantity, dispensed_qty")
      .eq("prescription_id", id);
    if (itemsError) throw new ValidationError(itemsError.message);
    const allDispensed = items.length > 0 && items.every((i) => i.dispensed_qty >= i.quantity);
    const someDispensed = items.some((i) => i.dispensed_qty > 0);
    patch.status = allDispensed ? "dispensed" : someDispensed ? "partially_dispensed" : "active";
  }

  const { data: updated, error } = await ctx.svc
    .from("prescriptions")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "prescriptions",
    entityId: id,
    description: Array.isArray(body.dispenseItems)
      ? "Dispensed prescription items"
      : patch.status
        ? `Prescription status set to ${patch.status}`
        : "Prescription updated",
  });

  return ok(updated);
});

export const runtime = "nodejs";
