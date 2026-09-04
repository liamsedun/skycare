import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

function adminOnly(role: string): void {
  if (role !== "hospital_admin") {
    throw new ForbiddenError("Only hospital admins can manage branches");
  }
}

async function loadBranch(svc: any, tenantId: string, id: string) {
  const { data, error } = await svc
    .from("branches")
    .select("id, name, code, address, city, state, phone, email, is_main, is_active")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  return data;
}

// PUT /api/pharmacy/admin/branches/[id] — rename / edit details / toggle active.
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const id = idFrom(req);
  const body = await req.json();

  const existing = await loadBranch(ctx.svc, tenantId, id);
  if (!existing) throw new NotFoundError("Branch not found");

  const patch: Record<string, any> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new ValidationError("Branch name is required");
    if (name.length > 120) throw new ValidationError("Branch name is too long");
    const { data: dup } = await ctx.svc
      .from("branches")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", name)
      .neq("id", id)
      .maybeSingle();
    if (dup) throw new ValidationError("A branch with that name already exists");
    patch.name = name;
  }
  if (body.code !== undefined) patch.code = body.code ? String(body.code).trim() : null;
  if (body.address !== undefined) patch.address = body.address ? String(body.address).trim() : null;
  if (body.city !== undefined) patch.city = body.city ? String(body.city).trim() : null;
  if (body.state !== undefined) patch.state = body.state ? String(body.state).trim() : null;
  if (body.phone !== undefined) patch.phone = body.phone ? String(body.phone).trim() : null;
  if (body.email !== undefined) patch.email = body.email ? String(body.email).trim() : null;
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;

  if (Object.keys(patch).length === 0) return ok(existing);

  const { data, error } = await ctx.svc
    .from("branches")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "branches",
    entityId: id,
    description: `Updated branch "${data.name}"${patch.is_active !== undefined ? ` — active: ${patch.is_active}` : ""}`,
  });

  return ok(data);
});

// DELETE /api/pharmacy/admin/branches/[id] — the main branch can never be
// deleted; other branches cascade/set-NULL their references in the DB.
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const id = idFrom(req);

  const existing = await loadBranch(ctx.svc, tenantId, id);
  if (!existing) throw new NotFoundError("Branch not found");
  if (existing.is_main) throw new ValidationError("The main branch cannot be deleted");

  // The DB SET NULLs users.branch_id via FK; also clear the auth claims so the
  // staff's next login doesn't carry a stale branch_id (GoTrue drops null keys
  // from app_metadata — absent == branchless everywhere).
  const { data: affected } = await ctx.svc
    .from("users")
    .select("id")
    .eq("branch_id", id);
  for (const u of affected ?? []) {
    const { data: au } = await ctx.svc.auth.admin.getUserById(u.id);
    if (au?.user?.app_metadata?.branch_id) {
      await ctx.svc.auth.admin.updateUserById(u.id, {
        app_metadata: { ...(au.user.app_metadata ?? {}), branch_id: null },
      });
    }
  }

  const { error } = await ctx.svc.from("branches").delete().eq("id", id).select("*");
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "branches",
    entityId: id,
    description: `Deleted branch "${existing.name}"`,
  });

  return ok({ deleted: true });
});

export const runtime = "nodejs";
