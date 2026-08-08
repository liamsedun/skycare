import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/admin/branches — tenant branches for price overrides
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("branches")
    .select("id, name, code, is_main, is_active")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (error) return ok([], 500);
  return ok((data ?? []).map((b: any) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    isMain: b.is_main,
    isActive: b.is_active,
  })));
});

export const runtime = "nodejs";