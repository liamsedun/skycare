import { withAuth, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { MODULE_KEYS } from "@/lib/nav";
import type { AccessLevel, ModuleAccess } from "@/lib/nav";
import type { NextRequest } from "next/server";
import { GRANTABLE_ROLES } from "../route";

export const dynamic = "force-dynamic";

async function loadUser(ctx: Parameters<typeof withAuth>[0] extends never ? never : any, id: string) {
  const { data } = await ctx.svc
    .from("users")
    .select("id, tenant_id, email, full_name, role, phone, is_active, module_access, created_at")
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

// PATCH /api/admin/users/[id] — update role / is_active / module_access (tenant-scoped)
export const PATCH = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") throw new ForbiddenError();
  if (ctx.role !== "super_admin") requireTenant(ctx);
  await requireModuleLevel(ctx, "staff", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const body = (await req.json()) as { role?: string; is_active?: boolean; module_access?: ModuleAccess };

  const user = await loadUser(ctx, id);
  if (!user || (ctx.role !== "super_admin" && user.tenant_id !== ctx.tenantId)) {
    throw new NotFoundError("User not found");
  }
  if (user.role === "super_admin") throw new ForbiddenError("Platform admins cannot be modified");
  if (user.id === ctx.user.id) throw new ForbiddenError("You cannot modify your own account here");

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.role === "string") {
    if (
      !GRANTABLE_ROLES.includes(body.role as never) &&
      !(ctx.role === "super_admin" && body.role === "super_admin")
    ) {
      throw new ValidationError("Cannot assign that role");
    }
    patch.role = body.role;
  }
  if ("module_access" in body) {
    const access = body.module_access;
    if (access !== null) {
      if (typeof access !== "object" || Array.isArray(access)) {
        throw new ValidationError("module_access must be an object of module key → level");
      }
      const normalized: Record<string, AccessLevel> = {};
      for (const [key, level] of Object.entries(access)) {
        if (!MODULE_KEYS.includes(key)) throw new ValidationError(`Unknown module key: ${key}`);
        if (level !== "full" && level !== "view_only" && level !== "none") {
          throw new ValidationError(`Invalid level for ${key}: ${level}`);
        }
        // Missing keys mean "none" — don't store explicit none entries.
        if (level !== "none") normalized[key] = level;
      }
      patch.module_access = Object.keys(normalized).length > 0 ? normalized : {};
    } else {
      patch.module_access = null;
    }
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
    description: `Updated ${user.email}${patch.role ? ` — role → ${patch.role}` : ""}${typeof body.is_active === "boolean" ? ` — active: ${body.is_active}` : ""}${"module_access" in body ? ` — module access: ${body.module_access && Object.keys(body.module_access).length > 0 ? Object.entries(body.module_access).map(([k, v]) => `${k}=${v}`).join(", ") : "role default"}` : ""}`,
  });
  return ok(data);
});

// DELETE /api/admin/users/[id] — permanent removal.
// hospital_admin: own-tenant staff only (never platform admins, never self).
// super_admin: platform-wide, still never other platform admins or self.
// Removes the auth account, the users row (staff profile + rosters + leave +
// notifications + mail + chats cascade), and nulls audit references.
export const DELETE = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  if (ctx.role !== "super_admin") requireTenant(ctx);
  await requireModuleLevel(ctx, "staff", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const user = await loadUser(ctx, id);
  if (!user || (ctx.role !== "super_admin" && user.tenant_id !== ctx.tenantId)) {
    throw new NotFoundError("User not found");
  }
  if (user.role === "super_admin") throw new ForbiddenError("Platform admins cannot be deleted");
  if (user.id === ctx.user.id) throw new ForbiddenError("You cannot delete your own account");

  // Remove the auth login first so the account can no longer sign in.
  try {
    await ctx.svc.auth.admin.deleteUser(id);
  } catch {
    /* auth row may already be gone */
  }

  // Delete the users row — staff, staff_roster, staff_leave, notifications,
  // internal_messages/recipients, chats/chat_messages, push_subscriptions
  // cascade; doctor/creator references are SET NULL by migration 0016.
  const { error } = await ctx.svc.from("users").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "users",
    entityId: id,
    description: `Permanently deleted ${user.email} (${user.role})`,
  });
  return ok({ deleted: true });
});

export const runtime = "nodejs";
