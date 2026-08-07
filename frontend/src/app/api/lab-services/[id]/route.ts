import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SERVICE_SELECT =
  "id, tenant_id, category_id, name, type, is_custom, external_lab_id, approval_status, approved_at, approved_by, created_by, price, reference_range, is_active, created_at, updated_at, lab_categories(id, name)";

async function getService(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("lab_services")
    .select(SERVICE_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const service = await getService(ctx, id, tenantId);
  if (!service) throw new NotFoundError("Service not found");
  return ok(service);
});

// PATCH /api/lab-services/[id] — edit fields (staff) or approve/reject (admin)
export const PATCH = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getService(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Service not found");

  const isAdmin = ctx.role === "hospital_admin" || ctx.role === "super_admin";
  const body = (await req.json()) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  for (const key of ["name", "category_id", "type", "price", "reference_range", "external_lab_id"]) {
    if (key in body) patch[key] = body[key];
  }

  if ("approval_status" in body) {
    if (!isAdmin) throw new ValidationError("Only hospital admins can approve or reject services");
    const status = String(body.approval_status);
    if (!["approved", "pending", "rejected"].includes(status)) {
      throw new ValidationError("Invalid approval status");
    }
    patch.approval_status = status;
    if (status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = ctx.user.id;
    }
  }

  if ("is_active" in body) {
    if (!isAdmin) throw new ValidationError("Only hospital admins can toggle service availability");
    patch.is_active = !!body.is_active;
  }

  if ("name" in patch) {
    const name = String(patch.name).trim();
    if (!name) throw new ValidationError("Service name is required");
    patch.name = name;
    const { data: dup } = await ctx.svc
      .from("lab_services")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", name)
      .neq("id", id)
      .maybeSingle();
    if (dup) throw new ValidationError("A service with this name already exists");
  }

  if ("category_id" in patch) {
    const categoryId = patch.category_id ? String(patch.category_id) : null;
    if (categoryId) {
      const { data: cat } = await ctx.svc
        .from("lab_categories")
        .select("id")
        .eq("id", categoryId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!cat) throw new ValidationError("Category not found");
    }
    patch.category_id = categoryId;
  }

  if ("type" in patch && !["lab", "imaging"].includes(patch.type as string)) {
    throw new ValidationError("Invalid service type");
  }

  const { data, error } = await ctx.svc
    .from("lab_services")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "lab_services",
    entityId: id,
    description: `Updated lab service ${data.name}`,
  });
  return ok(data);
});

// DELETE /api/lab-services/[id] — hospital admins only
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ValidationError("Only hospital admins can delete services");
  }
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getService(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Service not found");

  await ctx.svc.from("lab_services").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "lab_services",
    entityId: id,
    description: `Deleted lab service ${existing.name}`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
