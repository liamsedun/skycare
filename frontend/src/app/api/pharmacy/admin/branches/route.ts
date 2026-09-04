import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function adminOnly(role: string): void {
  if (role !== "hospital_admin") {
    throw new ForbiddenError("Only hospital admins can manage branches");
  }
}

// GET /api/pharmacy/admin/branches — tenant branches (staff-readable; used by
// price overrides, stock filters and the staff branch picker)
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("branches")
    .select("id, name, code, address, city, state, phone, email, is_main, is_active")
    .eq("tenant_id", tenantId)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (error) return ok([], 500);
  return ok((data ?? []).map((b: any) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    city: b.city,
    state: b.state,
    phone: b.phone,
    email: b.email,
    isMain: b.is_main,
    isActive: b.is_active,
  })));
});

// POST /api/pharmacy/admin/branches — create a branch for the tenant.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw new ValidationError("Branch name is required");
  if (name.length > 120) throw new ValidationError("Branch name is too long");

  const { data: dup } = await ctx.svc
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .maybeSingle();
  if (dup) throw new ValidationError("A branch with that name already exists");

  const { data, error } = await ctx.svc
    .from("branches")
    .insert({
      tenant_id: tenantId,
      name,
      code: body.code ? String(body.code).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      city: body.city ? String(body.city).trim() : null,
      state: body.state ? String(body.state).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      email: body.email ? String(body.email).trim() : null,
      is_main: false,
      is_active: body.isActive === undefined ? true : !!body.isActive,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "branches",
    entityId: data.id,
    description: `Created branch "${name}"`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";