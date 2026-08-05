import { withStaff, ok, ValidationError, NotFoundError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getStaff(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("staff")
    .select("*, users(id, email, full_name, role, phone, avatar_url, is_active)")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/staff/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const staff = await getStaff(ctx, id, tenantId);
  if (!staff) throw new NotFoundError("Staff member not found");
  return ok(staff);
});

// PUT /api/staff/[id] — staff profile fields (admin)
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getStaff(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Staff member not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "department", "specialization", "license_number", "years_of_exp", "qualification",
    "employment_type", "base_salary", "is_available", "available_from", "available_until",
    "on_leave_until",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  const { data, error } = await ctx.svc
    .from("staff")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "staff",
    entityId: id,
    description: `Updated staff profile ${existing.staff_number}`,
  });
  return ok(data);
});

// DELETE /api/staff/[id] — remove staff row (user account stays, deactivated)
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getStaff(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Staff member not found");

  await ctx.svc.from("staff").delete().eq("id", id).eq("tenant_id", tenantId);
  if (existing.user_id) {
    await ctx.svc.from("users").update({ is_active: false }).eq("id", existing.user_id);
  }

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "staff",
    entityId: id,
    description: `Removed staff ${existing.staff_number}`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
