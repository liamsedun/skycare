import { withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SERVICE_SELECT =
  "id, tenant_id, category_id, name, type, is_custom, external_lab_id, approval_status, approved_at, approved_by, created_by, price, reference_range, is_active, created_at, updated_at, lab_categories(id, name)";

// GET /api/lab-services?type=&category_id=&approval_status=&q=&include_inactive=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const type = resolveParam(req.nextUrl.searchParams.get("type"));
  const categoryId = resolveParam(req.nextUrl.searchParams.get("category_id"));
  const approval = resolveParam(req.nextUrl.searchParams.get("approval_status"));
  const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();

  let query = ctx.svc
    .from("lab_services")
    .select(SERVICE_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .range(from, to);

  if (type) query = query.eq("type", type);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (approval) query = query.eq("approval_status", approval);
  if (!includeInactive) query = query.eq("is_active", true);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateLabServiceBody {
  name: string;
  categoryId?: string;
  newCategory?: string;
  type?: "lab" | "imaging";
  price?: number;
  referenceRange?: string;
  externalLabId?: string;
}

// POST /api/lab-services — any staff can add a custom service; hospital admins
// create approved services, everyone else's land as pending approval.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateLabServiceBody;
  const name = body.name?.trim();
  if (!name) throw new ValidationError("Service name is required");
  const type = body.type === "imaging" ? "imaging" : "lab";
  const isAdmin = ctx.role === "hospital_admin" || ctx.role === "super_admin";

  let categoryId: string | null = body.categoryId || null;

  if (body.newCategory?.trim()) {
    if (!isAdmin) throw new ValidationError("Only hospital admins can create new categories");
    const catName = body.newCategory.trim();
    const { data: cat } = await ctx.svc
      .from("lab_categories")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", catName)
      .maybeSingle();
    if (cat) {
      categoryId = cat.id;
    } else {
      const { data: created, error: ce } = await ctx.svc
        .from("lab_categories")
        .insert({ tenant_id: tenantId, name: catName })
        .select("id")
        .single();
      if (ce) throw new ValidationError(ce.message);
      categoryId = created.id;
    }
  }

  if (categoryId) {
    const { data: cat } = await ctx.svc
      .from("lab_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cat) throw new ValidationError("Category not found");
  }

  const { data: dup } = await ctx.svc
    .from("lab_services")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .maybeSingle();
  if (dup) throw new ValidationError("A service with this name already exists");

  const { data, error } = await ctx.svc
    .from("lab_services")
    .insert({
      tenant_id: tenantId,
      category_id: categoryId,
      name,
      type,
      is_custom: true,
      external_lab_id: body.externalLabId?.trim() || null,
      approval_status: isAdmin ? "approved" : "pending",
      approved_at: isAdmin ? new Date().toISOString() : null,
      approved_by: isAdmin ? ctx.user.id : null,
      created_by: ctx.user.id,
      price: body.price ?? 0,
      reference_range: body.referenceRange?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_services",
    entityId: data.id,
    description: `Custom ${type} service "${name}" added${isAdmin ? " (approved)" : " (pending approval)"}`,
  });
  return ok(data, 201);
});

export const runtime = "nodejs";
