import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/pharmacy/insurance/claims/[id] — process a claim.
// Body: { status: "approved" | "paid" | "rejected", amount?, notes? }
// approved/paid records the insurer's payout against the invoice (skipped if
// the invoice is already fully paid) and flips the claim status.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").at(-1)!;
  const body = (await req.json()) as {
    status: "approved" | "paid" | "rejected";
    amount?: number;
    notes?: string;
  };

  if (!["approved", "paid", "rejected"].includes(body.status)) {
    throw new ValidationError("status must be approved, paid or rejected");
  }
  if (body.status === "rejected" && !body.notes?.trim()) {
    throw new ValidationError("A rejection reason (notes) is required");
  }

  const { data: existing } = await ctx.svc
    .from("insurance_claims")
    .select("id, claim_number, status, provider_name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Claim not found");
  if (existing.status === "paid") {
    throw new ValidationError("Claim is already paid");
  }

  const { error } = await ctx.svc.rpc("pharmacy_claim_process", {
    p_tenant_id: tenantId,
    p_claim_id: id,
    p_status: body.status,
    p_amount: body.amount == null ? null : Number(body.amount),
    p_user_id: ctx.user.id,
  });
  if (error) throw new ValidationError(error.message);

  const { data: claim, error: fetchAfter } = await ctx.svc
    .from("insurance_claims")
    .select("id, claim_number, claim_amount, co_pay_amount, approved_amount, status, patient_id")
    .eq("id", id)
    .single();
  if (fetchAfter || !claim) throw new ValidationError(fetchAfter?.message ?? "Claim not found");

  if (claim.patient_id) {
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [claim.patient_id],
      type: "payment_confirmed",
      title: `Insurance claim ${body.status}`,
      message: `${existing.claim_number} (${existing.provider_name}) — ₦${Number(claim.approved_amount ?? 0).toLocaleString()}`,
      referenceType: "insurance_claims",
      referenceId: claim.id,
    });
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "insurance_claims",
    entityId: claim.id,
    description: `Claim ${claim.claim_number} marked ${body.status}`,
  });

  return ok(claim);
});

export const runtime = "nodejs";