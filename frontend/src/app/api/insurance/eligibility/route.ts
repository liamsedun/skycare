import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/insurance/eligibility?patient_id=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const patientId = req.nextUrl.searchParams.get("patient_id");
  if (!patientId) throw new ValidationError("patient_id is required");

  // Verify patient exists
  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name, patient_number")
    .eq("id", patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new NotFoundError("Patient not found");

  // Call the RPC for patient insurance summary
  const { data: summary, error: rpcError } = await ctx.svc.rpc("get_patient_insurance_summary", {
    p_tenant: tenantId,
    p_patient: patientId,
  });
  if (rpcError) throw new ValidationError(rpcError.message);

  const policies = (summary ?? []) as any[];

  // Also fetch coverage rules for active providers
  const providerIds = [...new Set(policies.map((p: any) => p.provider_id ?? null).filter(Boolean))];
  let coverageRules: any[] = [];
  if (providerIds.length > 0) {
    const { data } = await ctx.svc
      .from("insurance_coverage_rules")
      .select("provider_id, service_type, coverage_percent, co_pay_amount, covered_amount, requires_authorization, tariff_code, tariff_name")
      .eq("tenant_id", tenantId)
      .in("provider_id", providerIds)
      .eq("is_active", true);
    coverageRules = data ?? [];
  }

  return ok({
    patient: {
      id: patient.id,
      firstName: patient.first_name,
      lastName: patient.last_name,
      patientNumber: patient.patient_number,
    },
    policies,
    coverageRules,
    hasActiveInsurance: policies.some((p: any) => p.status === "active"),
  });
});

export const runtime = "nodejs";
