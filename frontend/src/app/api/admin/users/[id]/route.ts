import { withAuth, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";
import { GRANTABLE_ROLES } from "../route";

export const dynamic = "force-dynamic";

async function loadUser(ctx: Parameters<typeof withAuth>[0] extends never ? never : any, id: string) {
  const { data } = await ctx.svc
    .from("users")
    .select("id, tenant_id, email, full_name, role, phone, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// GET /api/admin/users/[id]
export const GET = withAuth(async (req, ctx) => {
  requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") throw new ForbiddenError();
  const id = req.nextUrl.pathname.split("/").pop()!;
  const user = await loadUser(ctx, id);
  if (!user || (ctx.role !== "super_admin" && user.tenant_id !== ctx.tenantId)) {
    throw new NotFoundError("User not found");
  }
  return ok(user);
});

// PATCH /api/admin/users/[id] — update role / is_active (tenant-scoped)
export const PATCH = withAuth(async (req, ctx) => {
  requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") throw new ForbiddenError();
  const id = req.nextUrl.pathname.split("/").pop()!;
  const body = (await req.json()) as { role?: string; is_active?: boolean };

  const user = await loadUser(ctx, id);
  if (!user || (ctx.role !== "super_admin" && user.tenant_id !== ctx.tenantId)) {
    throw new NotFoundError("User not found");
  }
  if (user.role === "super_admin") throw new ForbiddenError("Platform admins cannot be modified");
  if (user.id === ctx.user.id) throw new ForbiddenError("You cannot modify your own account here");

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.role === "string") {
    if (!GRANTABLE_ROLES.includes(body.role as never)) {
      throw new ValidationError("Cannot assign that role");
    }
    patch.role = body.role;
  }
  if (Object.keys(patch).length === 0) return ok(user);

  const { data, error } = await ctx.svc
    .from("users")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Keep auth app_metadata in sync so the JWT carries the right role on next login.
  await ctx.svc.auth.admin.updateUserById(id, {
    app_metadata: {
      role: patch.role ?? user.role,
      tenant_id: ctx.tenantId,
      branch_id: ctx.branchId ?? null,
    },
  });

  await logAudit(req, ctx, {
    action: "update",
    entityType: "users",
    entityId: id,
    description: `Updated ${user.email}${patch.role ? ` — role → ${patch.role}` : ""}${typeof body.is_active === "boolean" ? ` — active: ${body.is_active}` : ""}`,
  });
  return ok(data);
});

// DELETE /api/admin/users/[id] — soft deactivate
export const DELETE = withAuth(async (req, ctx) => {
  requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") throw new ForbiddenError();
  const id = req.nextUrl.pathname.split("/").pop()!;
  const user = await loadUser(ctx, id);
  if (!user || (ctx.role !== "super_admin" && user.tenant_id !== ctx.tenantId)) {
    throw new NotFoundError("User not found");
  }
  if (user.role === "super_admin") throw new ForbiddenError("Platform admins cannot be modified");
  if (user.id === ctx.user.id) throw new ForbiddenError("You cannot deactivate your own account");

  const { data } = await ctx.svc
    .from("users")
    .update({ is_active: false })
    .eq("id", id)
    .select()
    .single();

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "users",
    entityId: id,
    description: `Deactivated ${user.email}`,
  });
  return ok(data);
});

export const runtime = "nodejs";
