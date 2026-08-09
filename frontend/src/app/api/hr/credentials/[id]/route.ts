import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PUT /api/hr/credentials/[id] — verify/edit a credential (HR admin).
// DELETE /api/hr/credentials/[id] — remove (HR admin).
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const patch: Record<string, unknown> = {};
  if (body?.certification != null) patch.certification = String(body.certification).trim();
  if (body?.license_number != null) patch.license_number = String(body.license_number).trim() || null;
  if (body?.issuing_body != null) patch.issuing_body = String(body.issuing_body).trim() || null;
  if (body?.expiry_date != null) patch.expiry_date = String(body.expiry_date).trim();
  if (body?.verified != null) {
    patch.verified = Boolean(body.verified);
    patch.verified_by = body.verified ? ctx.user.id : null;
    patch.verified_at = body.verified ? new Date().toISOString() : null;
  }

  const { data, error } = await ctx.svc
    .from("staff_credentials")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Credential not found");

  await syncProfileStatus(ctx.svc, tenantId, data.staff_id);
  await logAudit(req, ctx, {
    action: "update",
    entityType: "staff_credentials",
    entityId: id,
    changes: patch,
    description: patch.verified === true ? "Verified credential" : "Updated credential",
  });
  return ok(data);
});

export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const { data, error } = await ctx.svc
    .from("staff_credentials")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Credential not found");

  await syncProfileStatus(ctx.svc, tenantId, data.staff_id);
  await logAudit(req, ctx, { action: "delete", entityType: "staff_credentials", entityId: id, description: "Deleted credential" });
  return ok({ deleted: true });
});

async function syncProfileStatus(svc: SupabaseClient, tenantId: string, staffId: string) {
  const { data: creds } = await svc
    .from("staff_credentials")
    .select("verified, expiry_date")
    .eq("staff_id", staffId)
    .eq("tenant_id", tenantId);
  const list = creds ?? [];
  let status = "pending";
  if (list.some((c) => c.expiry_date < new Date().toISOString().slice(0, 10))) status = "expired";
  else if (list.length > 0 && list.every((c) => c.verified)) status = "verified";
  await svc.from("staff_profiles").update({ credentials_status: status }).eq("staff_id", staffId).eq("tenant_id", tenantId);
}
