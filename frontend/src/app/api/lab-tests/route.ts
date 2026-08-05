import { withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const SELECT = "id, tenant_id, name, category, price, reference_range, is_active, created_at, updated_at";

// GET /api/lab-tests?q=&category=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim();
  const category = resolveParam(req.nextUrl.searchParams.get("category"));

  let query = ctx.svc
    .from("lab_tests")
    .select(SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .range(from, to);

  if (q) query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`);
  if (category) query = query.ilike("category", `%${category}%`);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateLabTestBody {
  name: string;
  category?: string;
  price?: number;
  referenceRange?: string;
}

// POST /api/lab-tests
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateLabTestBody;
  if (!body.name?.trim()) throw new ValidationError("Test name is required");

  const { data: test, error } = await ctx.svc
    .from("lab_tests")
    .insert({
      tenant_id: tenantId,
      name: body.name.trim(),
      category: body.category?.trim() || null,
      price: body.price ?? 0,
      reference_range: body.referenceRange?.trim() || null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "lab_tests",
    entityId: test.id,
    description: `Added lab test "${test.name}"`,
  });

  return ok(test, 201);
});

// PUT /api/lab-tests/[id] lives in [id]/route.ts

export const runtime = "nodejs";
