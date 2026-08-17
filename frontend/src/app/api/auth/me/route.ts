import { withAuth, ok, ValidationError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/auth/me — current profile (user + tenant + patient family info)
export const GET = withAuth(async (req, ctx) => {
  const supabase = ctx.supabase;

  const [userRes, tenantRes, patientRes, staffRes] = await Promise.all([
    supabase.from("users").select("*").eq("id", ctx.user.id).maybeSingle(),
    ctx.tenantId
      ? supabase.from("tenants").select("id, name, slug, logo_url, brand_color, website_url").eq("id", ctx.tenantId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("patients")
      .select(
        "id, patient_number, first_name, last_name, gender, date_of_birth, is_primary_account, primary_account_id, dependant_relationship"
      )
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
    supabase
      .from("staff")
      .select("id, staff_number, department, specialization, is_available")
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
  ]);

  return ok({
    user: userRes.data,
    tenant: tenantRes.data,
    patient: patientRes.data,
    staff: staffRes.data,
    claims: {
      role: ctx.role,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
    },
  });
});

interface UpdateProfileBody {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

// PUT /api/auth/me — update own profile (name, phone, avatar)
export const PUT = withAuth(async (req, ctx) => {
  const body = (await req.json()) as UpdateProfileBody;

  const patch: Record<string, unknown> = {};
  if (body.fullName !== undefined) {
    const name = body.fullName.trim();
    if (name.length < 2) throw new ValidationError("Full name must be at least 2 characters");
    patch.full_name = name;
  }
  if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
  if (body.avatarUrl !== undefined) patch.avatar_url = body.avatarUrl || null;

  if (Object.keys(patch).length === 0) throw new ValidationError("Nothing to update");

  const { data: updated, error } = await ctx.svc
    .from("users")
    .update(patch)
    .eq("id", ctx.user.id)
    .select("id, full_name, email, phone, avatar_url, role")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "users",
    entityId: ctx.user.id,
    description: "Updated own profile",
  });

  return ok(updated);
});

export const runtime = "nodejs";