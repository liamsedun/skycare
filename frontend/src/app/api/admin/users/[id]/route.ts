import { withAuth, withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { MODULE_KEYS } from "@/lib/nav";
import type { AccessLevel, ModuleAccess } from "@/lib/nav";
import type { NextRequest } from "next/server";
import { GRANTABLE_ROLES } from "../route";

export const dynamic = "force-dynamic";

async function loadUser(ctx: Parameters<typeof withAuth>[0] extends never ? never : any, id: string) {
  const { data } = await ctx.svc
    .from("users")
    .select("id, tenant_id, branch_id, email, full_name, role, phone, is_active, module_access, created_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function resolveBranch(ctx: any, tenantId: string, branchId: unknown): Promise<string | null> {
  if (branchId === null || branchId === undefined || branchId === "") return null;
  const { data } = await ctx.svc
    .from("branches")
    .select("id, name")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) throw new ValidationError("Branch not found in this hospital");
  return data.id;
}

// GET /api/admin/users/[id]
export const GET = withStaff(async (req, ctx) => {
  requireTenant(ctx);
  await requireModuleLevel(ctx, "staff");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const user = await loadUser(ctx, id);
  if (!user || user.tenant_id !== ctx.tenantId) {
    throw new NotFoundError("User not found");
  }
  return ok(user);
});

// PATCH /api/admin/users/[id] — update role / is_active / module_access /
// full_name / email / phone (tenant-scoped). Email changes are pushed to the
// auth account first (duplicates rejected there), then the users mirror.
export const PATCH = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin") throw new ForbiddenError();
  requireTenant(ctx);
  await requireModuleLevel(ctx, "staff", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const body = (await req.json()) as {
    role?: string;
    is_active?: boolean;
    module_access?: ModuleAccess;
    full_name?: string;
    email?: string;
    phone?: string | null;
    branchId?: string | null;
  };

  const user = await loadUser(ctx, id);
  if (!user || user.tenant_id !== ctx.tenantId) {
    throw new NotFoundError("User not found");
  }
  if (user.role === "super_admin") throw new ForbiddenError("Platform admins cannot be modified");
  if (user.id === ctx.user.id) throw new ForbiddenError("You cannot modify your own account here");

  const patch: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body.role === "string") {
    if (
      !GRANTABLE_ROLES.includes(body.role as never)
    ) {
      throw new ValidationError("Cannot assign that role");
    }
    patch.role = body.role;
  }
  if (typeof body.full_name === "string") {
    const n = body.full_name.trim();
    if (!n) throw new ValidationError("Full name cannot be empty");
    patch.full_name = n;
  }
  if (typeof body.email === "string") {
    const em = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new ValidationError("Invalid email address");
    patch.email = em;
  }
  if ("phone" in body) patch.phone = body.phone ? String(body.phone).trim() : null;
  if ("branchId" in body) {
    // Only an explicit branchId key changes the branch — absent means "leave
    // it alone" (never overwrite with the editor's own branch claim).
    const scopeTenant = ctx.tenantId ?? user.tenant_id;
    if (!scopeTenant) throw new ValidationError("Platform users cannot be assigned a branch");
    patch.branch_id = await resolveBranch(ctx, scopeTenant, body.branchId);
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

  // Email is authoritative in auth: update it there FIRST so a duplicate
  // email fails before the mirror is touched.
  if (patch.email) {
    const auth = await ctx.svc.auth.admin.updateUserById(id, {
      email: patch.email as string,
      email_confirm: true,
    });
    if (auth.error) throw new ValidationError(auth.error.message);
  }

  const { data, error } = await ctx.svc
    .from("users")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  // Keep auth app_metadata in sync so the JWT carries the right role on next login.
  // branch_id keeps the target's own branch (patched value, else current) — never the editor's.
  await ctx.svc.auth.admin.updateUserById(id, {
    app_metadata: {
      role: patch.role ?? user.role,
      tenant_id: user.tenant_id,
      branch_id: patch.branch_id !== undefined ? patch.branch_id : user.branch_id,
    },
  });

  const changes: string[] = [];
  if (patch.role) changes.push(`role → ${patch.role}`);
  if (typeof body.is_active === "boolean") changes.push(`active: ${body.is_active}`);
  if (patch.full_name) changes.push(`name → ${patch.full_name}`);
  if (patch.email) changes.push(`email → ${patch.email}`);
  if ("phone" in body) changes.push(`phone → ${patch.phone ?? "—"}`);
  if ("branchId" in body) changes.push(`branch → ${patch.branch_id ?? "none"}`);
  if (patch.module_access !== undefined) {
    changes.push(
      `module access: ${patch.module_access && Object.keys(patch.module_access as Record<string, unknown>).length > 0 ? Object.entries(patch.module_access as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(", ") : "role default"}`
    );
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "users",
    entityId: id,
    description: `Updated ${user.email}${changes.length ? ` — ${changes.join("; ")}` : ""}`,
  });
  return ok(data);
});

// DELETE /api/admin/users/[id] — permanent removal.
// hospital_admin: own-tenant staff only (never platform admins, never self).
// Removes the auth account, the users row (staff profile + rosters + leave +
// notifications + mail + chats cascade), and nulls audit references.
export const DELETE = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  requireTenant(ctx);
  await requireModuleLevel(ctx, "staff", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const user = await loadUser(ctx, id);
  if (!user || user.tenant_id !== ctx.tenantId) {
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
