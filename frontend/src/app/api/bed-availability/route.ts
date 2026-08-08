import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/bed-availability — live map for the Bed Map screen:
// per ward -> seats with status + occupant name when occupied.
// The frontend pairs this with a realtime subscription on beds so the map
// updates the moment a bed toggles occupancy.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);

  const [{ data: wards, error: wardsErr }, { data: admissions, error: admErr }] = await Promise.all([
    ctx.svc
      .from("wards")
      .select("id, name, ward_type, is_active, branch_id")
      .eq("tenant_id", tenantId)
      .order("name"),
    ctx.svc
      .from("admissions")
      .select("id, patient_id, bed_id, admitted_at, status, patients(first_name, last_name, patient_number)")
      .eq("tenant_id", tenantId)
      .in("status", ["admitted", "transferred"]),
  ]);
  if (wardsErr || admErr) throw new Error((wardsErr ?? admErr)?.message);

  const occupantsByBed = new Map<string, { patient_id: string; name: string; patientNumber: string; admissionId: string; admittedAt: string }>();
    for (const a of admissions ?? []) {
    const p = Array.isArray(a.patients) ? a.patients?.[0] : a.patients;
    if (a.bed_id && p) {
      occupantsByBed.set(a.bed_id, {
        patient_id: a.patient_id,
        name: `${p.first_name} ${p.last_name}`,
        patientNumber: p.patient_number,
        admissionId: a.id,
        admittedAt: a.admitted_at,
      });
    }
  }

  const bedGroups = new Map<string, Array<{ id: string; bedNumber: string; status: string; occupant?: any }>>();
  const { data: beds, error: bedsErr } = await ctx.svc
    .from("beds")
    .select("id, ward_id, bed_number, status")
    .order("bed_number");
  if (bedsErr) throw new Error(bedsErr.message);
  for (const b of beds ?? []) {
    const arr = bedGroups.get(b.ward_id) ?? [];
    const occupant = occupantsByBed.get(b.id) ?? null;
    arr.push({ id: b.id, bedNumber: b.bed_number, status: b.status, occupant: occupantsByBed.get(b.id) ?? null });
    bedGroups.set(b.ward_id, arr);
  }

  return ok(
    (wards ?? []).map((w) => ({
      ...w,
      beds: bedGroups.get(w.id) ?? [],
    }))
  );
});