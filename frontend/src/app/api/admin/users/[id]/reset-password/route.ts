import { withAuth, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/admin/users/[id]/reset-password — set a new password (direct credentials)
export const POST = withAuth(async (req, ctx) => {
  requireTenant(ctx);
  if (ctx.role !== "hospital_admin") throw new ForbiddenError();
  const id = req.nextUrl.pathname.split("/")[4]!; // /api/admin/users/[id]/reset-password
  const body = (await req.json()) as { password?: string };
  if (!body.password || body.password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const { data: user } = await ctx.svc
    .from("users")
    .select("id, tenant_id, email, role")
    .eq("id", id)
    .maybeSingle();
  if (!user || user.tenant_id !== ctx.tenantId) {
    throw new NotFoundError("User not found");
  }
  if (user.role === "super_admin") throw new ForbiddenError("Platform admins cannot be modified");

  const { error } = await ctx.svc.auth.admin.updateUserById(id, { password: body.password });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "users",
    entityId: id,
    description: `Reset password for ${user.email}`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
