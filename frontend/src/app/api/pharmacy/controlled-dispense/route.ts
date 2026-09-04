import { withAuth, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export interface ControlledDispenseBody {
  drugId: string;
  prescriptionId: string;
  patientId: string;
  quantity: number;
  branchId?: string | null;
  notes?: string;
}

// POST /api/pharmacy/controlled-dispense
// Pharmacist-only route: the RPC re-checks NAFDAC registration, active
// prescription linkage and the per-dispense cap at the DB boundary; the
// append-only register + hash-chained audit are written by triggers.
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = (await req.json()) as ControlledDispenseBody;

    if (!body.drugId || !body.prescriptionId || !body.patientId) {
      throw new ValidationError("drugId, prescriptionId and patientId are required");
    }
    const quantity = Math.floor(Number(body.quantity) || 0);
    if (quantity <= 0) throw new ValidationError("quantity must be a positive integer");

    const { data: drug } = await ctx.svc
      .from("pharmacy_drugs")
      .select("id, name, is_controlled")
      .eq("id", body.drugId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!drug) throw new NotFoundError("Drug not found");
    if (!drug.is_controlled) throw new ValidationError("Only controlled drugs use this route");

    const { data: rx } = await ctx.svc
      .from("prescriptions")
      .select("id, patient_id, status, patients(first_name, last_name, patient_number)")
      .eq("id", body.prescriptionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!rx) throw new NotFoundError("Prescription not found");
    if (rx.patient_id !== body.patientId) {
      throw new ValidationError("Prescription does not belong to this patient");
    }
    if (["cancelled", "completed"].includes(rx.status)) {
      throw new ValidationError(`Prescription is ${rx.status} and cannot be dispensed`);
    }

    const { data: moved, error } = await ctx.svc.rpc("pharmacy_controlled_dispense", {
      p_tenant: tenantId,
      p_drug: body.drugId,
      p_prescription: body.prescriptionId,
      p_patient: body.patientId,
      p_branch: body.branchId ?? null,
      p_qty: quantity,
      p_created_by: ctx.user.id,
      p_notes: body.notes?.trim() || null,
    });
    if (error) throw new ValidationError(error.message);

const p = (rx.patients as { first_name?: string; last_name?: string; patient_number?: string } | null) ?? {};
    const patientName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || `#${p.patient_number ?? rx.id?.slice(0, 8) ?? "?"}`;

    await logAudit(req, ctx, {
      action: "create",
      entityType: "controlled_drug_register",
      entityId: body.drugId,
      description: `Controlled dispense: ${drug.name} ×${quantity} for ${patientName} (Rx ${rx.id.slice(0, 8)}) — ${moved} movement row(s)`,
    });

    return ok({ dispensed: moved }, 201);
  },
  { roles: ["hospital_admin", "pharmacist"] as const }
);

export const runtime = "nodejs";