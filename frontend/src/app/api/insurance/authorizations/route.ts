import { withStaff, ok, okPaginated, ValidationError, requireTenant, getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const AUTH_SELECT =
  "id, patient_id, provider_id, policy_id, authorization_number, service_type, service_description, estimated_amount, status, approved_amount, valid_until, notes, requested_by, approved_by, created_at, updated_at, patients!insurance_authorizations_patient_id_fkey(id, first_name, last_name, patient_number), insurance_providers!insurance_authorizations_provider_id_fkey(id, name, provider_type), insurance_policies!insurance_authorizations_policy_id_fkey(id, policy_number, plan_name)";

// GET /api/insurance/authorizations?status=&patient_id=&provider_id=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const status = resolveParam(req.nextUrl.searchParams.get("status"));
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const providerId = resolveParam(req.nextUrl.searchParams.get("provider_id"));

  let query = ctx.svc
    .from("insurance_authorizations")
    .select(AUTH_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (patientId) query = query.eq("patient_id", patientId);
  if (providerId) query = query.eq("provider_id", providerId);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface AuthBody {
  patientId: string;
  providerId: string;
  policyId: string;
  serviceType: string;
  serviceDescription?: string | null;
  estimatedAmount: number;
  notes?: string | null;
}

function validateAuthBody(body: any): AuthBody {
  if (!body?.patientId?.trim()) throw new ValidationError("Patient ID is required");
  if (!body?.providerId?.trim()) throw new ValidationError("Provider ID is required");
  if (!body?.policyId?.trim()) throw new ValidationError("Policy ID is required");
  if (!body?.serviceType?.trim()) throw new ValidationError("Service type is required");
  if (body.estimatedAmount === undefined || body.estimatedAmount === null) {
    throw new ValidationError("Estimated amount is required");
  }
  const amt = Number(body.estimatedAmount);
  if (!Number.isFinite(amt) || amt < 0) throw new ValidationError("Estimated amount must be a non-negative number");
  return {
    patientId: body.patientId.trim(),
    providerId: body.providerId.trim(),
    policyId: body.policyId.trim(),
    serviceType: body.serviceType.trim(),
    serviceDescription: body.serviceDescription?.trim() || null,
    estimatedAmount: amt,
    notes: body.notes?.trim() || null,
  };
}

// POST /api/insurance/authorizations
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = validateAuthBody(await req.json());

  // Verify provider exists
  const { data: provider } = await ctx.svc
    .from("insurance_providers")
    .select("id")
    .eq("id", body.providerId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!provider) throw new ValidationError("Insurance provider not found");

  // Verify policy exists
  const { data: policy } = await ctx.svc
    .from("insurance_policies")
    .select("id, patient_id")
    .eq("id", body.policyId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!policy) throw new ValidationError("Insurance policy not found");

  const { data, error } = await ctx.svc
    .from("insurance_authorizations")
    .insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      provider_id: body.providerId,
      policy_id: body.policyId,
      service_type: body.serviceType,
      service_description: body.serviceDescription,
      estimated_amount: body.estimatedAmount,
      notes: body.notes,
      requested_by: ctx.user.id,
      status: "pending",
    })
    .select(AUTH_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "insurance_authorizations",
    entityId: data.id,
    description: `Created authorization request for ${body.serviceType} — estimated ₦${body.estimatedAmount.toLocaleString()}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";
