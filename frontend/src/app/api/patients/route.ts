import { withStaff, okPaginated, ok, ValidationError, requireTenant, sanitizeLike, requireModuleLevel } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getTenantSettings, generatePatientNumber } from "@/lib/tenant-settings";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/patients?q=&status=&page=&pageSize=  (staff; tenant-scoped)
export const GET = withStaff(async (req, ctx) => {
  requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();
  const status = resolveParam(req.nextUrl.searchParams.get("status"));

  let query = ctx.svc
    .from("patients")
    .select(
      "id, patient_number, first_name, last_name, other_names, gender, date_of_birth, phone, email, city, state, status, is_primary_account, primary_account_id, dependant_relationship, created_at",
      { count: "exact" }
    )
    .eq("tenant_id", ctx.tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    query = query.or(
      `first_name.ilike.%${sanitizeLike(q)}%,last_name.ilike.%${sanitizeLike(q)}%,patient_number.ilike.%${sanitizeLike(q)}%,phone.ilike.%${sanitizeLike(q)}%,email.ilike.%${sanitizeLike(q)}%`
    );
  }
  if (status) query = query.eq("status", status);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreatePatientBody {
  firstName: string;
  lastName: string;
  otherNames?: string;
  gender?: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  bloodGroup?: string;
  genotype?: string;
  maritalStatus?: string;
  allergies?: string;
  heightCm?: string | number;
  weightKg?: string | number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  chronicConditions?: string;
  nhiaNumber?: string;
  insuranceProvider?: string;
  insurancePlan?: string;
  isInsured?: boolean;
  nextOfKin?: Record<string, unknown>;
  // optional patient portal credentials
  portalEmail?: string;
  portalPassword?: string;
  mustChangePassword?: boolean;
}

/**
 * Normalizes a blood group: "0+" → "O+", lowercase → uppercase, trims whitespace.
 * Unlike a strict validator, unknown custom values are kept (the form supports
 * "add others" entries that are not in the canonical ABO list).
 */
export function normalizeBloodGroup(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return value.trim().toUpperCase().replace(/0/g, "O");
}

// POST /api/patients — register a patient (staff). Optional portal login.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "patients", "full");
  const body = (await req.json()) as CreatePatientBody;

  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    throw new ValidationError("First and last name are required");
  }

  const normalizedBloodGroup = normalizeBloodGroup(body.bloodGroup);

  const settings = await getTenantSettings(ctx.svc, tenantId);
  const patientNumber = await generatePatientNumber(ctx.svc, tenantId, settings.patientPrefix);

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .maybeSingle();
  const tenantName = tenant?.name ?? "Hospital";

  // Create portal login when requested (patient gets patient_api role + tenant claims)
  let portalUserId: string | null = null;
  if (body.portalEmail && body.portalPassword) {
    if (body.portalPassword.length < 8) {
      throw new ValidationError("Portal password must be at least 8 characters");
    }
    const { data: authUser, error: authError } = await ctx.svc.auth.admin.createUser({
      email: body.portalEmail.trim().toLowerCase(),
      password: body.portalPassword,
      email_confirm: true,
      app_metadata: { role: "patient_api", tenant_id: tenantId, branch_id: ctx.branchId ?? null },
      user_metadata: {
        full_name: `${body.firstName} ${body.lastName}`,
        ...(body.mustChangePassword ? { must_change_password: true } : {}),
      },
    });
    if (authError || !authUser?.user) {
      throw new ValidationError(authError?.message ?? "Failed to create patient portal account");
    }
    const { error: userError } = await ctx.svc.from("users").insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      email: body.portalEmail.trim().toLowerCase(),
      full_name: `${body.firstName} ${body.lastName}`.trim(),
      role: "patient_api",
      phone: body.phone?.trim() || null,
      is_active: true,
    });
    if (userError) {
      await ctx.svc.auth.admin.deleteUser(authUser.user.id);
      throw new ValidationError("Failed to save patient portal account");
    }
    portalUserId = authUser.user.id;
  }

  const { data: patient, error } = await ctx.svc
    .from("patients")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      primary_branch_id: ctx.branchId ?? null,
      patient_number: patientNumber,
      user_id: portalUserId,
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      other_names: body.otherNames?.trim() || null,
      gender: body.gender || null,
      date_of_birth: body.dateOfBirth || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      blood_group: normalizedBloodGroup,
      genotype: body.genotype || null,
      ...(body.maritalStatus?.trim()
        ? { marital_status: body.maritalStatus.trim().toLowerCase() }
        : { marital_status: "single" }),
      allergies: body.allergies || null,
      height_cm: body.heightCm ? Number(body.heightCm) : null,
      weight_kg: body.weightKg ? Number(body.weightKg) : null,
      emergency_contact_name: body.emergencyContactName?.trim() || null,
      emergency_contact_phone: body.emergencyContactPhone?.trim() || null,
      chronic_conditions: body.chronicConditions || null,
      nhia_number: body.nhiaNumber?.trim() || null,
      insurance_provider: body.insuranceProvider?.trim() || null,
      insurance_plan: body.insurancePlan?.trim() || null,
      is_insured: body.isInsured ?? false,
      next_of_kin: body.nextOfKin ?? {},
      is_primary_account: true,
    })
    .select()
    .single();
  if (error) {
    if (portalUserId) {
      await ctx.svc.auth.admin.deleteUser(portalUserId);
      await ctx.svc.from("users").delete().eq("id", portalUserId);
    }
    throw new ValidationError(error.message);
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "patients",
    entityId: patient.id,
    description: `Registered patient ${patientNumber} — ${patient.first_name} ${patient.last_name} (${tenantName})`,
  });

  return ok(patient);
});

export const runtime = "nodejs";
