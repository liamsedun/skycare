import { withStaff, ok, ValidationError, ForbiddenError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin, hrHasPermission } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/permissions — role permission matrix (HR admin; lazy-seeds defaults).
// PUT /api/hr/permissions — update a role's matrix (HR admin, hr.permissions.manage).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) await requireModuleLevel(ctx, "hr-staff");
  await ctx.svc.rpc("hr_seed_role_permissions", { p_tenant: tenantId });

  const { data, error } = await ctx.svc
    .from("roles_permissions")
    .select("id, role, permissions")
    .eq("tenant_id", tenantId)
    .order("role");
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role) && !(await hrHasPermission(ctx.svc, tenantId, ctx.role, "hr.permissions.manage"))) {
    throw new ForbiddenError("HR admin access required");
  }
  const body = await req.json().catch(() => null);
  const role = String(body?.role ?? "").trim();
  const permissions = body?.permissions;
  if (!role) throw new ValidationError("role is required");
  if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
    throw new ValidationError("permissions must be an object");
  }

  const { data, error } = await ctx.svc
    .from("roles_permissions")
    .upsert({ tenant_id: tenantId, role, permissions, updated_by: ctx.user.id }, { onConflict: "tenant_id,role" })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "roles_permissions",
    entityId: data.id,
    changes: { role, permissions },
    description: `Updated permission matrix for ${role}`,
  });
  return ok(data);
});
