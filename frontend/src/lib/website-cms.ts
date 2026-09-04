import { NextRequest } from "next/server";
import {
  withAuth,
  requireTenant,
  ok,
  err,
  parseBody,
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { invalidateServicesCache, invalidateDepartmentsCache } from "@/lib/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared admin CRUD for the tenant-website CMS tables (website_services,
 * website_departments). Both tables share the same shape:
 *   name, description, icon, image_url, display_order, active
 * Public reads happen server-side on the /[slug] pages via the service
 * client; these routes are the staff-facing management API (ADMIN roles only).
 */

export type CmsTable = "website_services" | "website_departments";

async function invalidateCmsCache(tenantId: string, table: CmsTable): Promise<void> {
  if (table === "website_services") await invalidateServicesCache(tenantId);
  else await invalidateDepartmentsCache(tenantId);
}

export function adminOnly(role: string): void {
  if (role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

export function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

export type CmsItemBody = {
  name?: string;
  description?: string | null;
  icon?: string | null;
  image_url?: string | null;
  display_order?: number;
  active?: boolean;
};

async function duplicateName(
  svc: SupabaseClient,
  table: CmsTable,
  tenantId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  let q = svc
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.maybeSingle();
  return !!data;
}

export function cmsList(table: CmsTable) {
  return withAuth(async (_req, ctx) => {
    adminOnly(ctx.role);
    const tenantId = requireTenant(ctx);
    const { data, error } = await ctx.svc
      .from(table)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) return err(error.message, 500);
    return ok(data);
  });
}

export function cmsCreate(table: CmsTable, label: string) {
  return withAuth(async (req, ctx) => {
    adminOnly(ctx.role);
    const tenantId = requireTenant(ctx);

    const body = await parseBody<CmsItemBody>(req);
    const name = body.name?.trim();
    if (!name) throw new ValidationError("Name is required");

    const norm = name.toLowerCase();
    if (await duplicateName(ctx.svc, table, tenantId, norm)) {
      throw new ValidationError(`A ${label} with this name already exists`);
    }

    const { data, error } = await ctx.svc
      .from(table)
      .insert({
        tenant_id: tenantId,
        name,
        description: body.description ?? null,
        icon: body.icon ?? null,
        image_url: body.image_url ?? null,
        display_order: body.display_order ?? 0,
        active: body.active ?? true,
      })
      .select()
      .single();

    if (error) return err(error.message, 500);

    await logAudit(req, ctx, {
      action: "create",
      entityType: table,
      entityId: data.id,
      description: `Added website ${label}`,
    });

    await invalidateCmsCache(tenantId, table);

    return ok(data, 201);
  });
}

export function cmsUpdate(table: CmsTable, label: string) {
  return withAuth(async (req, ctx) => {
    adminOnly(ctx.role);
    const tenantId = requireTenant(ctx);
    const id = idFrom(req);

    const { data: existing, error: getErr } = await ctx.svc
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (getErr || !existing) throw new NotFoundError(`${label} not found`);

    const body = await parseBody<CmsItemBody>(req);
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new ValidationError("Name is required");
      if (await duplicateName(ctx.svc, table, tenantId, name.toLowerCase(), id)) {
        throw new ValidationError(`A ${label} with this name already exists`);
      }
      patch.name = name;
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.image_url !== undefined) patch.image_url = body.image_url;
    if (body.display_order !== undefined) patch.display_order = body.display_order;
    if (body.active !== undefined) patch.active = !!body.active;

    if (Object.keys(patch).length === 0) throw new ValidationError("No fields to update");

    const { data, error } = await ctx.svc.from(table).update(patch).eq("id", id).select().single();
    if (error) return err(error.message, 500);

    await logAudit(req, ctx, {
      action: "update",
      entityType: table,
      entityId: id,
      description: `Updated website ${label}`,
    });

    await invalidateCmsCache(tenantId, table);

    return ok(data);
  });
}

export function cmsDelete(table: CmsTable, label: string) {
  return withAuth(async (req, ctx) => {
    adminOnly(ctx.role);
    const tenantId = requireTenant(ctx);
    const id = idFrom(req);

    const { data: existing, error: getErr } = await ctx.svc
      .from(table)
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (getErr || !existing) throw new NotFoundError(`${label} not found`);

    const { error } = await ctx.svc.from(table).delete().eq("id", id);
    if (error) return err(error.message, 500);

    await logAudit(req, ctx, {
      action: "delete",
      entityType: table,
      entityId: id,
      description: `Deleted website ${label}`,
    });

    await invalidateCmsCache(tenantId, table);

    return ok({ ok: true });
  });
}
