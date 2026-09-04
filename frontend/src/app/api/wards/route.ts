import { withStaff, ok, ValidationError, requireTenant, ForbiddenError, isAdminRole, applyBranchFilter } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const WARD_SELECT =
  "id, name, ward_type, is_active, branch_id, created_at, updated_at, beds(id, bed_number, status), ward_daily_rates(id, rate)";

// GET /api/wards — list wards with bed counts + daily rates (staff; all roles).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  let query = ctx.svc
    .from("wards")
    .select(WARD_SELECT)
    .eq("tenant_id", tenantId)
    .order("name");

  query = applyBranchFilter(query, req.nextUrl.searchParams, ctx);

  const { data: wards, error } = await query;
  if (error) throw new Error(error.message);
  return ok(wards ?? []);
});

// POST /api/wards — create a ward (hospital_admin).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only administrators can add wards");
  }
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const wardType = String(body?.ward_type ?? "general").trim();
  const branchId = body?.branch_id ?? null;
  const VALID_TYPES = ["general", "private", "icu", "maternity", "surgical", "pediatric", "observation"];
  if (!name) throw new ValidationError("Ward name is required");
  if (!VALID_TYPES.includes(wardType)) throw new ValidationError("Invalid ward type");

  const { data, error } = await ctx.svc
    .from("wards")
    .insert({ tenant_id: tenantId, branch_id: branchId, name, ward_type: wardType })
    .select(WARD_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "wards",
    entityId: data?.id ?? null,
    changes: { name, ward_type: wardType, branch_id: branchId },
    description: `Created ward ${name}`,
  });
  return ok(data);
});