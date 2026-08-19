import { withAuth, requireTenant, ok, ForbiddenError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/website/provision — seed the default tenant website (name-derived
// tagline/about/hours/social + 8 services + 5 departments + an About page).
// Idempotent (seed_website_defaults uses ON CONFLICT DO NOTHING and only fills
// website JSONB when unprovisioned). Admin-only. Powers the onboarding wizard's
// Finish step and the Settings "Provision default website" button for tenants
// that predate Phase 4 (they are flagged provisioned=true so the first-run
// wizard is not forced on them, but the button still runs this).
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  if (!tenantId) throw new ForbiddenError("No tenant to provision");

  const { error } = await ctx.svc.rpc("seed_website_defaults", { p_tenant_id: tenantId });
  if (error) return ok({ ok: false, error: error.message }, 500);

  const [svcRes, deptRes, pageRes] = await Promise.all([
    ctx.svc.from("website_services").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc.from("website_departments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ctx.svc.from("website_pages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  // Read the resulting state for the response.
  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("website, website_enabled, website_provisioned")
    .eq("id", tenantId)
    .maybeSingle();

  await logAudit(req, ctx, {
    action: "update",
    entityType: "tenants",
    entityId: tenantId,
    description: "Provisioned default tenant website content",
  });

  return ok({
    ok: true,
    website: tenant?.website ?? {},
    website_enabled: tenant?.website_enabled ?? true,
    website_provisioned: tenant?.website_provisioned ?? true,
    counts: {
      services: svcRes.count ?? 0,
      departments: deptRes.count ?? 0,
      pages: pageRes.count ?? 0,
    },
  });
});

export const runtime = "nodejs";