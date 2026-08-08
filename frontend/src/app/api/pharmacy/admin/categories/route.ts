import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/admin/categories — platform families + tenant's own
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("pharmacy_categories")
    .select("id, tenant_id, name, description, color")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return ok([], 500);

  const mapped = (data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    platform: c.tenant_id === null,
    description: c.description,
    color: c.color,
  }));
  return ok(mapped);
});

export const runtime = "nodejs";