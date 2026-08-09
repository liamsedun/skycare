import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, CLINICAL_ROLES } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/admissions?status=&branch=&search= — current census (staff).
// POST /api/admissions — admit a patient to a bed via ward_admit RPC
// (hospital_admin / doctor / nurse / super_admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim() || null;
  const branch = sp.get("branch")?.trim() || null;
  const search = sp.get("search")?.trim() || null;

  let query = ctx.svc
    .from("admissions")
    .select(
      "id, tenant_id, branch_id, patient_id, visit_id, bed_id, admitted_at, discharged_at, " +
      "expected_discharge, admitting_doctor, status, diagnosis_at_admission, notes, created_at, updated_at, " +
      "patients(id, first_name, last_name, patient_number, gender, date_of_birth), " +
      "beds(id, bed_number, status, ward_id, ward:wards(name, ward_type))"
    )
    .eq("tenant_id", tenantId);
  if (branch) query = query.eq("branch_id", branch);
  if (status === "active") query = query.in("status", ["admitted", "transferred"]);
  else if (status) query = query.eq("status", status);
  const { data, error } = await query.order("admitted_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter(
    (a: any) => !search || `${a.patients?.first_name ?? ""} ${a.patients?.last_name ?? ""} ${a.patients?.patient_number ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );
  return ok(rows);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!CLINICAL_ROLES.includes(ctx.role ?? "receptionist")) {
    throw new ForbiddenError("Only clinical staff can admit patients");
  }
  const body = await req.json().catch(() => null);
  const patientId = body?.patientId ?? body?.patient_id ?? null;
  const bedId = body?.bed_id ?? body?.bedId ?? null;
  if (!patientId || !bedId) throw new ValidationError("patient_id and bed_id are required");

  const { data, error } = await ctx.svc.rpc("ward_admit", {
    p_tenant: tenantId,
    p_patient_id: patientId,
    p_bed_id: bedId,
    p_visit_id: body?.visit_id ?? body?.visitId ?? null,
    p_admitting_doctor: body?.admitting_doctor ?? null,
    p_expected_discharge: body?.expected_discharge ?? null,
    p_diagnosis: body?.diagnosis ?? body?.diagnosis_at_admission ?? null,
    p_notes: body?.notes ?? null,
    p_branch: body?.branch_id ?? null,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "admissions",
    entityId: data ?? null,
    changes: { patient_id: patientId, bed_id: bedId, diagnosis: body?.diagnosis ?? null },
    description: "Admitted patient to ward",
  });
  return ok(data);
});