import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const POLICY_SELECT =
  "id, patient_id, provider_id, policy_number, plan_name, coverage_type, co_pay_percent, co_pay_amount, effective_date, expiry_date, status, dependants_covered, is_primary, created_at, updated_at, patients!insurance_policies_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!insurance_policies_provider_id_fkey(id, name, provider_type)";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// GET /api/insurance/policies/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data, error } = await ctx.svc
    .from("insurance_policies")
    .select(POLICY_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Insurance policy not found");
  return ok(data);
});

// PUT /api/insurance/policies/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing } = await ctx.svc
    .from("insurance_policies")
    .select("id, policy_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Insurance policy not found");

  const patch: Record<string, any> = {};
  if (body.policyNumber !== undefined) {
    if (!body.policyNumber?.trim()) throw new ValidationError("Policy number is required");
    patch.policy_number = body.policyNumber.trim();
  }
  if (body.planName !== undefined) patch.plan_name = body.planName?.trim() || null;
  if (body.coverageType !== undefined) {
    if (!["full", "partial", "co-pay"].includes(body.coverageType)) {
      throw new ValidationError("Coverage type must be full, partial, or co-pay");
    }
    patch.coverage_type = body.coverageType;
  }
  if (body.coPayPercent !== undefined) {
    const p = Number(body.coPayPercent);
    if (body.coPayPercent !== null && body.coPayPercent !== "" && (!Number.isFinite(p) || p < 0 || p > 100)) {
      throw new ValidationError("Co-pay percent must be between 0 and 100");
    }
    patch.co_pay_percent = body.coPayPercent === null || body.coPayPercent === "" ? null : p;
  }
  if (body.coPayAmount !== undefined) {
    const a = Number(body.coPayAmount);
    if (body.coPayAmount !== null && body.coPayAmount !== "" && (!Number.isFinite(a) || a < 0)) {
      throw new ValidationError("Co-pay amount must be non-negative");
    }
    patch.co_pay_amount = body.coPayAmount === null || body.coPayAmount === "" ? null : a;
  }
  if (body.effectiveDate !== undefined) {
    if (!body.effectiveDate?.trim()) throw new ValidationError("Effective date is required");
    patch.effective_date = body.effectiveDate.trim();
  }
  if (body.expiryDate !== undefined) patch.expiry_date = body.expiryDate?.trim() || null;
  if (body.status !== undefined) {
    if (!["active", "expired", "suspended", "terminated"].includes(body.status)) {
      throw new ValidationError("Status must be active, expired, suspended, or terminated");
    }
    patch.status = body.status;
  }
  if (body.dependantsCovered !== undefined) {
    const d = Number(body.dependantsCovered);
    if (!Number.isFinite(d) || d < 0) throw new ValidationError("Dependants covered must be non-negative");
    patch.dependants_covered = d;
  }
  if (body.isPrimary !== undefined) patch.is_primary = !!body.isPrimary;

  if (Object.keys(patch).length === 0) {
    throw new ValidationError("No fields to update");
  }

  if (patch.policy_number && patch.policy_number !== existing.policy_number) {
    const { data: dup } = await ctx.svc
      .from("insurance_policies")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("policy_number", patch.policy_number)
      .neq("id", id)
      .maybeSingle();
    if (dup) throw new ValidationError("A policy with this number already exists");
  }

  const { data, error } = await ctx.svc
    .from("insurance_policies")
    .update(patch)
    .eq("id", id)
    .select(POLICY_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "insurance_policies",
    entityId: id,
    description: `Updated insurance policy: ${existing.policy_number}`,
  });

  return ok(data);
});

// DELETE /api/insurance/policies/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: existing } = await ctx.svc
    .from("insurance_policies")
    .select("id, policy_number")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Insurance policy not found");

  const { error } = await ctx.svc.from("insurance_policies").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "insurance_policies",
    entityId: id,
    description: `Deleted insurance policy: ${existing.policy_number}`,
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";
