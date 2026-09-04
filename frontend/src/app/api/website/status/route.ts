import { withAuth, requireTenant, ok, ForbiddenError } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/website/status — Phase 4 wizard/redirect state for the staff portal.
// Returns whether the default website has been provisioned, whether the public
// site is enabled, the current website JSONB content, and CMS row counts.
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  if (!tenantId) throw new ForbiddenError("No tenant");

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("slug, website, website_enabled, website_provisioned")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) throw new ForbiddenError("Tenant not found");

  const [svcRes, deptRes, pageRes] = await Promise.all([
    ctx.svc.from("website_services").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc.from("website_departments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc.from("website_pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  return ok({
    slug: tenant.slug ?? null,
    website_enabled: tenant.website_enabled ?? true,
    website_provisioned: tenant.website_provisioned ?? false,
    website: tenant.website ?? {},
    counts: {
      services: svcRes.count ?? 0,
      departments: deptRes.count ?? 0,
      pages: pageRes.count ?? 0,
    },
  });
});

export const runtime = "nodejs";