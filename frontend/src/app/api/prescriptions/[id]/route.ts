import { withAuth, withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const RX_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, visit_id, diagnosis, notes, status, pharmacy_type, external_pharmacy_name, dispensed_at, dispensed_by, issued_date, expires_date, created_at, updated_at, patients(id, patient_number, first_name, last_name), users(id, full_name, role), prescription_items(id, drug_id, pharmacy_drug_id, medication_name, dosage, frequency, route, duration, quantity, refills, dispensed_qty, instructions)";

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

const ALLOWED_STATUSES = ["pending", "processing", "dispensed", "partial", "cancelled", "completed"];

// PUT /api/prescriptions/[id] — metadata + lifecycle transitions.
// Dispensing itself lives at POST /api/prescriptions/[id]/dispense.
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
  if (patch.status && !ALLOWED_STATUSES.includes(patch.status as string)) {
    throw new ValidationError("Invalid prescription status");
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
    description: patch.status ? `Prescription status set to ${patch.status}` : "Prescription updated",
  });

  return ok(updated);
});

export const runtime = "nodejs";
