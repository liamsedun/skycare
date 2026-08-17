import { withAuth, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getTenantSettings, generatePatientNumber } from "@/lib/tenant-settings";
import { createPortalAccount } from "@/lib/dependant-portal";
import { storePatientAvatar } from "@/lib/patient-avatar";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/dependants?patient_id=&page=&pageSize=
// Patient callers see their own family; staff filter by ?patient_id (primary).
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = req.nextUrl.searchParams.get("patient_id");

  let primaryIds: string[] | null = null;
  if (ctx.role === "patient_api") {
    const { data: self } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    if (!self) return okPaginated([], 0, page, pageSize);
    primaryIds = [self.primary_account_id ?? self.id];
  }

  let query = ctx.svc
    .from("patients")
    .select(
      "id, patient_number, first_name, last_name, gender, date_of_birth, phone, email, city, state, blood_group, genotype, allergies, chronic_conditions, dependant_relationship, is_primary_account, primary_account_id, user_id, status, avatar_url, created_at, users(avatar_url)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .eq("is_primary_account", false)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (patientId) query = query.eq("primary_account_id", patientId);
  if (primaryIds) query = query.in("primary_account_id", primaryIds);

  const { data, count } = await query;
  const rows = (data ?? []).map((row) => {
    const r = row as Record<string, unknown> & { users?: { avatar_url?: string | null } | null };
    const { users: linkedUser, ...rest } = r;
    return {
      ...rest,
      avatar_url: (rest.avatar_url as string | null | undefined) ?? linkedUser?.avatar_url ?? null,
    };
  });
  return okPaginated(rows, count ?? 0, page, pageSize);
});

export interface CreateDependantBody {
  primaryPatientId: string;
  firstName: string;
  lastName: string;
  gender?: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  relationship: string;
  bloodGroup?: string;
  genotype?: string;
  allergies?: string;
  chronicConditions?: string;
  address?: string;
  city?: string;
  state?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  portalEmail?: string;
  portalPassword?: string;
  avatar?: string;
}

// POST /api/dependants — add a family member to a primary patient account
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateDependantBody;

  if (!body.primaryPatientId || !body.firstName?.trim() || !body.lastName?.trim()) {
    throw new ValidationError("Primary patient, first and last name are required");
  }
  if (!body.relationship?.trim()) {
    throw new ValidationError("Relationship is required");
  }

  // The primary must exist in the caller's tenant (or be the caller's own family root)
  const { data: primary } = await ctx.svc
    .from("patients")
    .select(
      "id, tenant_id, is_primary_account, address, city, state, emergency_contact_name, emergency_contact_phone"
    )
    .eq("id", body.primaryPatientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!primary) throw new NotFoundError("Primary patient not found");
  if (ctx.role === "patient_api") {
    const { data: self } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id, is_primary_account")
      .eq("user_id", ctx.user.id)
      .maybeSingle();
    // Only the main account holder may add family members — a dependant
    // must never add another person as a dependant.
    if (!self || self.primary_account_id !== null || self.is_primary_account !== true) {
      throw new ValidationError("Only the main account holder can add family members");
    }
    if (primary.id !== self.id) {
      throw new ValidationError("You can only add dependants to your own family account");
    }
  }

  const settings = await getTenantSettings(ctx.svc, tenantId);
  const dependantNumber = await generatePatientNumber(ctx.svc, tenantId, settings.dependantPrefix);

  // Optional portal login for the dependant — explicit credentials win; otherwise
  // a login is auto-provisioned from the dependant's own email with a generated
  // temporary password (returned once so staff can share it).
  let portalUserId: string | null = null;
  let tempPassword: string | null = null;
  const explicitEmail = body.portalEmail?.trim().toLowerCase();
  const explicitPassword = body.portalPassword;
  const fallbackEmail = body.email?.trim().toLowerCase() || null;
  if (explicitEmail && explicitPassword) {
    if (explicitPassword.length < 8) {
      throw new ValidationError("Portal password must be at least 8 characters");
    }
    const res = await createPortalAccount(ctx.svc, {
      email: explicitEmail,
      fullName: `${body.firstName} ${body.lastName}`.trim(),
      tenantId,
      branchId: ctx.branchId ?? null,
      phone: body.phone?.trim() ?? null,
      password: explicitPassword,
    });
    portalUserId = res.userId;
  } else if ((explicitEmail || explicitPassword) && !fallbackEmail) {
    throw new ValidationError("Portal login needs both an email and a password");
  } else if (fallbackEmail) {
    const res = await createPortalAccount(ctx.svc, {
      email: fallbackEmail,
      fullName: `${body.firstName} ${body.lastName}`.trim(),
      tenantId,
      branchId: ctx.branchId ?? null,
      phone: body.phone?.trim() ?? null,
    });
    portalUserId = res.userId;
    tempPassword = res.tempPassword;
  }

  const { data: dependant, error } = await ctx.svc
    .from("patients")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_number: dependantNumber,
      user_id: portalUserId,
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      gender: body.gender || null,
      date_of_birth: body.dateOfBirth || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      blood_group: body.bloodGroup || null,
      genotype: body.genotype || null,
      allergies: body.allergies || null,
      chronic_conditions: body.chronicConditions || null,
      // Shared info inherited from the primary account (editable later).
      address: body.address?.trim() || primary.address || null,
      city: body.city?.trim() || primary.city || null,
      state: body.state?.trim() || primary.state || null,
      emergency_contact_name:
        body.emergencyContactName?.trim() || primary.emergency_contact_name || null,
      emergency_contact_phone:
        body.emergencyContactPhone?.trim() || primary.emergency_contact_phone || null,
      is_primary_account: false,
      primary_account_id: body.primaryPatientId,
      dependant_relationship: body.relationship.trim(),
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

  // Optional photo (Life Blossom parity): data-URL avatar → public avatars
  // bucket. Update the just-created row; on failure remove the dependant so
  // the modal's error state means "nothing was added".
  let finalRow = dependant;
  if (body.avatar) {
    try {
      const avatarUrl = await storePatientAvatar(ctx.svc, tenantId, dependant.id, body.avatar);
      const { data: updated, error: avatarError } = await ctx.svc
        .from("patients")
        .update({ avatar_url: avatarUrl })
        .eq("id", dependant.id)
        .select()
        .single();
      if (avatarError) throw new Error(avatarError.message);
      finalRow = updated;
    } catch (avatarErr) {
      await ctx.svc.from("patients").delete().eq("id", dependant.id);
      if (portalUserId) {
        await ctx.svc.auth.admin.deleteUser(portalUserId);
        await ctx.svc.from("users").delete().eq("id", portalUserId);
      }
      throw new ValidationError(avatarErr instanceof Error ? avatarErr.message : "Failed to save the photo");
    }
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "patients",
    entityId: dependant.id,
    description: `Added dependant ${dependantNumber} — ${dependant.first_name} ${dependant.last_name} (${body.relationship})`,
  });
  return ok(tempPassword ? { ...finalRow, tempPassword } : finalRow);
});

export const runtime = "nodejs";
