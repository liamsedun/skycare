import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, CLINICAL_ROLES } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyInvoiceIssued } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/discharges — discharge an active admission via ward_discharge.
// Requires a summary. hospital_admin / doctor / nurse / super_admin.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!CLINICAL_ROLES.includes(ctx.role ?? "receptionist")) {
    throw new ForbiddenError("Only clinical staff can discharge patients");
  }
  const body = await req.json().catch(() => null);
  const admissionId = body?.admission_id ?? body?.admissionId ?? null;
  const summary = String(body?.summary ?? "").trim();
  if (!admissionId) throw new ValidationError("admission_id is required");
  if (!summary) throw new ValidationError("Discharge summary is required");

  const { data, error } = await ctx.svc.rpc("ward_discharge", {
    p_tenant: tenantId,
    p_admission_id: admissionId,
    p_summary: summary,
    p_medications: body?.medications ?? [],
    p_follow_up: body?.follow_up ?? body?.followUp ?? null,
    p_by: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "admissions",
    entityId: data ?? null,
    changes: { status: "discharged", summary },
    description: "Discharged patient from ward",
  });

  // Post the room charge (ward_daily_rates x nights) to the invoices ledger.
  // Billing is best-effort: the discharge is already committed, so a billing
  // failure is logged and surfaced as charge:null rather than failing the
  // response. ward_discharge_charges is idempotent (invoices.admission_id).
  let charge = null;
  const { data: ch, error: chError } = await ctx.svc.rpc("ward_discharge_charges", {
    p_tenant: tenantId,
    p_admission_id: admissionId,
    p_by: ctx.user.id,
  });
  if (!chError && ch) {
    charge = {
      invoiceId: ch.invoice_id,
      invoiceNumber: ch.invoice_number,
      description: ch.description,
      charge: Number(ch.charge ?? 0),
      nights: Number(ch.nights ?? 0),
      rate: Number(ch.rate ?? 0),
      alreadyPosted: ch.already_posted === true,
    };
    if (charge.alreadyPosted === false) {
      const { data: admission } = await ctx.svc
        .from("admissions")
        .select("patient_id")
        .eq("id", admissionId)
        .maybeSingle();
      await notifyInvoiceIssued(ctx.svc, tenantId, admission?.patient_id, ch.invoice_id, ch.invoice_number, Number(ch.charge ?? 0));
    }
    await logAudit(req, ctx, {
      action: "create",
      entityType: "invoices",
      entityId: ch.invoice_id,
      changes: { charge, admission_id: admissionId },
      description: `Ward charges ${charge.invoiceNumber} (₦${charge.charge.toLocaleString()}) posted on discharge`,
    });
  } else if (chError) {
    await logAudit(req, ctx, {
      action: "update",
      entityType: "admissions",
      entityId: data ?? null,
      description: `Ward discharge billing failed: ${chError.message}`,
    });
  }

  return ok({ admissionId: data, charge });
});