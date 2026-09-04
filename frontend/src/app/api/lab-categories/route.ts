import { withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CATEGORY_SELECT =
  "id, tenant_id, name, is_active, created_at, updated_at, lab_services(count)";

// GET /api/lab-categories?q=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();

  let query = ctx.svc
    .from("lab_categories")
    .select(CATEGORY_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .range(from, to);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

// POST /api/lab-categories — hospital admins only
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin") {
    throw new ValidationError("Only hospital admins can create categories");
  }
  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) throw new ValidationError("Category name is required");

  const { data: existing } = await ctx.svc
    .from("lab_categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) throw new ValidationError("Category already exists");

  const { data, error } = await ctx.svc
    .from("lab_categories")
    .insert({ tenant_id: tenantId, name })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_categories",
    entityId: data.id,
    description: `Created lab category ${name}`,
  });
  return ok(data, 201);
});

export const runtime = "nodejs";
