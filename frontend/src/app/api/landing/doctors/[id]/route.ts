import {
  withAuth,
  ok,
  err,
  parseBody,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { invalidateDoctorsCache } from "@/lib/cache";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

function adminOnly(role: string): void {
  if (role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

// PUT /api/landing/doctors/[id]
export const PUT = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const id = idFrom(req);

  const body = await parseBody<{
    name?: string;
    specialty?: string;
    available?: boolean;
    availability?: string;
    image_url?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }>(req);

  const { data: existing, error: getErr } = await ctx.svc
    .from("landing_doctors")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Doctor not found");

  const patch: Record<string, any> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) throw new ValidationError("Name is required");
    patch.name = body.name.trim();
  }
  if (body.specialty !== undefined) {
    if (!body.specialty.trim()) throw new ValidationError("Specialty is required");
    patch.specialty = body.specialty.trim();
  }
  if (body.available !== undefined) patch.available = !!body.available;
  if (body.availability !== undefined) patch.availability = body.availability;
  if (body.image_url !== undefined) patch.image_url = body.image_url;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;

  if (Object.keys(patch).length === 0) throw new ValidationError("No fields to update");

  const { data, error } = await ctx.svc.from("landing_doctors").update(patch).eq("id", id).select().single();
  if (error) return err(error.message, 500);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "landing_doctors",
    entityId: id,
    description: "Updated website doctor",
  });

  await invalidateDoctorsCache(tenantId);

  return ok(data);
});

// DELETE /api/landing/doctors/[id]
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  adminOnly(ctx.role);
  const id = idFrom(req);

  const { data: existing, error: getErr } = await ctx.svc
    .from("landing_doctors")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !existing) throw new NotFoundError("Doctor not found");

  const { error } = await ctx.svc.from("landing_doctors").delete().eq("id", id);
  if (error) return err(error.message, 500);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "landing_doctors",
    entityId: id,
    description: "Deleted website doctor",
  });

  await invalidateDoctorsCache(tenantId);

  return ok({ ok: true });
});

export const runtime = "nodejs";
