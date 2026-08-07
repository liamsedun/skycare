import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getTenantSettings, generatePatientNumber } from "@/lib/tenant-settings";
import { normalizeBloodGroup, type CreatePatientBody } from "@/app/api/patients/route";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/patients/import — bulk create patients from a CSV (staff; tenant-scoped).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as { records?: CreatePatientBody[] };
  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length === 0) throw new ValidationError("No records to import");

  const settings = await getTenantSettings(ctx.svc, tenantId);
  const errors: { row: number; message: string }[] = [];
  let created = 0;

  for (let i = 0; i < records.length; i++) {
    const b = records[i];
    const rowNo = i + 2; // 1-indexed including the header row
    if (!b.firstName?.trim() || !b.lastName?.trim()) {
      errors.push({ row: rowNo, message: "First and last name are required" });
      continue;
    }
    try {
      const patientNumber = await generatePatientNumber(ctx.svc, tenantId, settings.patientPrefix);
      const { data: patient, error } = await ctx.svc
        .from("patients")
        .insert({
          tenant_id: tenantId,
          branch_id: ctx.branchId ?? null,
          primary_branch_id: ctx.branchId ?? null,
          patient_number: patientNumber,
          user_id: null,
          first_name: b.firstName.trim(),
          last_name: b.lastName.trim(),
          other_names: b.otherNames?.trim() || null,
          gender: b.gender || null,
          date_of_birth: b.dateOfBirth || null,
          phone: b.phone?.trim() || null,
          email: b.email?.trim().toLowerCase() || null,
          address: b.address?.trim() || null,
          city: b.city?.trim() || null,
          state: b.state?.trim() || null,
          blood_group: normalizeBloodGroup(b.bloodGroup),
          genotype: b.genotype || null,
          marital_status: b.maritalStatus?.trim().toLowerCase() || "single",
          allergies: b.allergies || null,
          height_cm: b.heightCm ? Number(b.heightCm) : null,
          weight_kg: b.weightKg ? Number(b.weightKg) : null,
          emergency_contact_name: b.emergencyContactName?.trim() || null,
          emergency_contact_phone: b.emergencyContactPhone?.trim() || null,
          is_primary_account: true,
        })
        .select("id, patient_number")
        .single();
      if (error) throw new Error(error.message);
      created++;
    } catch (e) {
      errors.push({ row: rowNo, message: e instanceof Error ? e.message : "Insert failed" });
    }
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "patients",
    entityId: `bulk/${created}`,
    description: `CSV import: created ${created} patient(s), ${errors.length} failed`,
  });

  return ok({ created, errors });
});

export const runtime = "nodejs";