import { withStaff, ok, okPaginated, ValidationError, requireTenant, getPagination, resolveParam, sanitizeLike } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const POLICY_SELECT =
  "id, patient_id, provider_id, policy_number, plan_name, coverage_type, co_pay_percent, co_pay_amount, effective_date, expiry_date, status, dependants_covered, is_primary, created_at, updated_at, patients!insurance_policies_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!insurance_policies_provider_id_fkey(id, name, provider_type)";

// GET /api/insurance/policies?patient_id=&provider_id=&status=&search=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const providerId = resolveParam(req.nextUrl.searchParams.get("provider_id"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const search = resolveParam(req.nextUrl.searchParams.get("search"));

  let query = ctx.svc
    .from("insurance_policies")
    .select(POLICY_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("patient_id", patientId);
  if (providerId) query = query.eq("provider_id", providerId);
  if (status) query = query.eq("status", status);
  if (search) query = query.ilike("policy_number", `%${sanitizeLike(search)}%`);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface PolicyBody {
  patientId: string;
  providerId: string;
  policyNumber: string;
  planName?: string | null;
  coverageType: string;
  coPayPercent?: number | null;
  coPayAmount?: number | null;
  effectiveDate: string;
  expiryDate?: string | null;
  status?: string;
  dependantsCovered?: number;
  isPrimary?: boolean;
}

function validatePolicyBody(body: any): PolicyBody {
  if (!body?.patientId?.trim()) throw new ValidationError("Patient ID is required");
  if (!body?.providerId?.trim()) throw new ValidationError("Provider ID is required");
  if (!body?.policyNumber?.trim()) throw new ValidationError("Policy number is required");
  if (!body?.coverageType?.trim()) throw new ValidationError("Coverage type is required");
  if (!["full", "partial", "co-pay"].includes(body.coverageType.trim())) {
    throw new ValidationError("Coverage type must be full, partial, or co-pay");
  }
  if (!body?.effectiveDate?.trim()) throw new ValidationError("Effective date is required");
  if (body.coPayPercent !== undefined && body.coPayPercent !== null) {
    const p = Number(body.coPayPercent);
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new ValidationError("Co-pay percent must be between 0 and 100");
  }
  if (body.coPayAmount !== undefined && body.coPayAmount !== null) {
    const a = Number(body.coPayAmount);
    if (!Number.isFinite(a) || a < 0) throw new ValidationError("Co-pay amount must be non-negative");
  }
  if (body.status && !["active", "expired", "suspended", "terminated"].includes(body.status)) {
    throw new ValidationError("Status must be active, expired, suspended, or terminated");
  }
  return {
    patientId: body.patientId.trim(),
    providerId: body.providerId.trim(),
    policyNumber: body.policyNumber.trim(),
    planName: body.planName?.trim() || null,
    coverageType: body.coverageType.trim(),
    coPayPercent: body.coPayPercent ?? null,
    coPayAmount: body.coPayAmount ?? null,
    effectiveDate: body.effectiveDate.trim(),
    expiryDate: body.expiryDate?.trim() || null,
    status: body.status || "active",
    dependantsCovered: body.dependantsCovered ?? 0,
    isPrimary: body.isPrimary ?? true,
  };
}

// POST /api/insurance/policies
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = validatePolicyBody(await req.json());

  // Check unique policy_number per tenant
  const { data: existingPolicy } = await ctx.svc
    .from("insurance_policies")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("policy_number", body.policyNumber)
    .maybeSingle();
  if (existingPolicy) throw new ValidationError("A policy with this number already exists");

  // Check unique patient+provider per tenant
  const { data: existingEnrollment } = await ctx.svc
    .from("insurance_policies")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("patient_id", body.patientId)
    .eq("provider_id", body.providerId)
    .maybeSingle();
  if (existingEnrollment) throw new ValidationError("This patient already has a policy with this provider");

  // Auto-set is_primary if this is the first policy for the patient
  if (body.isPrimary) {
    const { count: existingCount } = await ctx.svc
      .from("insurance_policies")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("patient_id", body.patientId);
    if ((existingCount ?? 0) > 0) {
      body.isPrimary = false;
    }
  }

  const { data, error } = await ctx.svc
    .from("insurance_policies")
    .insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      provider_id: body.providerId,
      policy_number: body.policyNumber,
      plan_name: body.planName,
      coverage_type: body.coverageType,
      co_pay_percent: body.coPayPercent,
      co_pay_amount: body.coPayAmount,
      effective_date: body.effectiveDate,
      expiry_date: body.expiryDate,
      status: body.status,
      dependants_covered: body.dependantsCovered,
      is_primary: body.isPrimary,
    })
    .select(POLICY_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  // Auto-copy to dependants if primary
  if (body.isPrimary) {
    const { data: dependants } = await ctx.svc
      .from("patients")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("primary_account_id", body.patientId);
    if (dependants && dependants.length > 0) {
      const dependantPolicies = dependants.map((d) => ({
        tenant_id: tenantId,
        patient_id: d.id,
        provider_id: body.providerId,
        policy_number: body.policyNumber,
        plan_name: body.planName,
        coverage_type: body.coverageType,
        co_pay_percent: body.coPayPercent,
        co_pay_amount: body.coPayAmount,
        effective_date: body.effectiveDate,
        expiry_date: body.expiryDate,
        status: body.status,
        dependants_covered: 0,
        is_primary: false,
      }));
      await ctx.svc.from("insurance_policies").upsert(dependantPolicies, {
        onConflict: "tenant_id,patient_id,provider_id",
        ignoreDuplicates: true,
      });
    }
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "insurance_policies",
    entityId: data.id,
    description: `Created insurance policy: ${body.policyNumber} for patient ${body.patientId}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";
