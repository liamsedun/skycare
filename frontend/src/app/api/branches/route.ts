import { withAuth, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/branches — lightweight branch list for the topbar switcher. Any authenticated user. */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("branches")
    .select("id, name, code, is_main")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });
  if (error) return ok([]);
  return ok(data ?? []);
});

export const runtime = "nodejs";
