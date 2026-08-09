import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/credentials — credential register (staff see own; HR admin all).
// POST /api/hr/credentials — add a credential (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const isHr = isHrAdmin(ctx.role);
  let query = ctx.svc
    .from("staff_credentials")
    .select("id, staff_id, license_number, certification, issuing_body, expiry_date, verified, verified_at, staff:staff(staff_number, department, users(full_name, role))")
    .eq("tenant_id", tenantId);
  if (!isHr) {
    const { data: me } = await ctx.svc.from("staff").select("id").eq("user_id", ctx.user.id).eq("tenant_id", tenantId).maybeSingle();
    if (!me) return ok([]);
    query = query.eq("staff.id", me.id);
  }
  const { data, error } = await query.order("expiry_date");
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);
  const staffId = String(body?.staff_id ?? "").trim();
  const certification = String(body?.certification ?? "").trim();
  const expiryDate = String(body?.expiry_date ?? "").trim();
  if (!staffId || !certification || !expiryDate) {
    throw new ValidationError("staff_id, certification and expiry_date are required");
  }

  const { data, error } = await ctx.svc
    .from("staff_credentials")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      staff_id: staffId,
      license_number: String(body?.license_number ?? "").trim() || null,
      certification,
      issuing_body: String(body?.issuing_body ?? "").trim() || null,
      expiry_date: expiryDate,
      verified: Boolean(body?.verified),
      verified_by: body?.verified ? ctx.user.id : null,
      verified_at: body?.verified ? new Date().toISOString() : null,
      created_by: ctx.user.id,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await syncProfileStatus(ctx, tenantId, staffId);
  await logAudit(req, ctx, {
    action: "create",
    entityType: "staff_credentials",
    entityId: data.id,
    changes: { staff_id: staffId, certification },
    description: `Added credential ${certification}`,
  });
  return ok(data, 201);
});

async function syncProfileStatus(
  ctx: { svc: import("@supabase/supabase-js").SupabaseClient },
  tenantId: string,
  staffId: string
) {
  const { data: creds } = await ctx.svc
    .from("staff_credentials")
    .select("verified, expiry_date")
    .eq("staff_id", staffId)
    .eq("tenant_id", tenantId);
  const list = creds ?? [];
  let status = "pending";
  if (list.some((c) => c.expiry_date < new Date().toISOString().slice(0, 10))) status = "expired";
  else if (list.length > 0 && list.every((c) => c.verified)) status = "verified";
  await ctx.svc.from("staff_profiles").update({ credentials_status: status }).eq("staff_id", staffId).eq("tenant_id", tenantId);
}
