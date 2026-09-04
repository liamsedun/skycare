import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CLAIM_SELECT =
  "id, claim_number, invoice_id, pharmacy_invoice_id, patient_id, provider_id, policy_id, authorization_id, encounter_date, encounter_type, diagnosis_code, diagnosis_description, service_code, items, total_billed, total_covered, total_co_pay, status, submitted_at, processed_at, paid_at, payment_reference, notes, created_by, processed_by, created_at, updated_at, patients!hmo_claims_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!hmo_claims_provider_id_fkey(id, name, provider_type), insurance_policies!hmo_claims_policy_id_fkey(id, policy_number, plan_name)";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// GET /api/insurance/claims/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data, error } = await ctx.svc
    .from("hmo_claims")
    .select(CLAIM_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Claim not found");
  return ok(data);
});

// PUT /api/insurance/claims/[id] — status transitions
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing } = await ctx.svc
    .from("hmo_claims")
    .select("id, claim_number, status, total_billed, invoice_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Claim not found");

  const action = body.action as string | undefined;
  if (!action) throw new ValidationError("action is required (submit, approve, partially_approve, reject, pay, appeal)");

  const VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ["submit", "reject"],
    pending: ["submit", "approve", "partially_approve", "reject"],
    submitted: ["approve", "partially_approve", "reject"],
    adjudicated: ["approve", "partially_approve", "reject"],
    approved: ["pay", "appeal"],
    partially_approved: ["pay", "appeal"],
    rejected: ["appeal"],
    paid: [],
    appealed: ["approve", "reject"],
  };

  if (!VALID_TRANSITIONS[existing.status]?.includes(action)) {
    throw new ValidationError(`Cannot ${action} a claim with status "${existing.status}"`);
  }

  const patch: Record<string, any> = {};
  const now = new Date().toISOString();

  switch (action) {
    case "submit":
      patch.status = "submitted";
      patch.submitted_at = now;
      break;
    case "approve":
      patch.status = "approved";
      patch.processed_at = now;
      patch.processed_by = ctx.user.id;
      if (body.approvedAmount !== undefined) {
        const a = Number(body.approvedAmount);
        if (!Number.isFinite(a) || a < 0) throw new ValidationError("Approved amount must be non-negative");
        patch.total_covered = a;
      } else {
        patch.total_covered = existing.total_billed;
      }
      break;
    case "partially_approve":
      patch.status = "partially_approved";
      patch.processed_at = now;
      patch.processed_by = ctx.user.id;
      if (body.approvedAmount !== undefined) {
        const a = Number(body.approvedAmount);
        if (!Number.isFinite(a) || a < 0) throw new ValidationError("Approved amount must be non-negative");
        if (a >= existing.total_billed) throw new ValidationError("Partially approved amount must be less than total billed");
        patch.total_covered = a;
      } else {
        throw new ValidationError("approvedAmount is required for partial approval");
      }
      break;
    case "reject":
      patch.status = "rejected";
      patch.processed_at = now;
      patch.processed_by = ctx.user.id;
      if (body.notes?.trim()) patch.notes = body.notes.trim();
      break;
    case "pay":
      patch.status = "paid";
      patch.paid_at = now;
      if (body.paymentReference?.trim()) patch.payment_reference = body.paymentReference.trim();
      break;
    case "appeal":
      patch.status = "appealed";
      if (body.notes?.trim()) patch.notes = body.notes.trim();
      break;
  }

  const { data, error } = await ctx.svc
    .from("hmo_claims")
    .update(patch)
    .eq("id", id)
    .select(CLAIM_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  // On pay: update linked invoice's paid_amount
  if (action === "pay" && existing.invoice_id) {
    const approved = Number(patch.total_covered ?? data.total_covered ?? 0);
    const { data: invoice } = await ctx.svc
      .from("invoices")
      .select("id, total_amount, paid_amount")
      .eq("id", existing.invoice_id)
      .maybeSingle();
    if (invoice) {
      const newPaid = Number(invoice.paid_amount ?? 0) + approved;
      const total = Number(invoice.total_amount);
      const newStatus = newPaid >= total ? "paid" : newPaid > 0 ? "partially_paid" : "pending";
      await ctx.svc
        .from("invoices")
        .update({ paid_amount: newPaid, status: newStatus })
        .eq("id", existing.invoice_id);
    }
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "hmo_claims",
    entityId: id,
    description: `Claim ${existing.claim_number}: ${action} (from ${existing.status} to ${patch.status})`,
    changes: { action, from: existing.status, to: patch.status, approvedAmount: patch.total_covered },
  });

  return ok(data);
});

// DELETE not allowed — reject instead
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: existing } = await ctx.svc
    .from("hmo_claims")
    .select("id, claim_number, status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Claim not found");

  if (existing.status === "rejected") {
    throw new ValidationError("Claim is already rejected");
  }

  const { data, error } = await ctx.svc
    .from("hmo_claims")
    .update({ status: "rejected", notes: "Rejected via delete" })
    .eq("id", id)
    .select(CLAIM_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "hmo_claims",
    entityId: id,
    description: `Claim ${existing.claim_number} rejected`,
  });

  return ok(data);
});

export const runtime = "nodejs";
