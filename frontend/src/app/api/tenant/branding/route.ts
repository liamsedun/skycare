import { withAuth, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skycare.app";

// GET /api/tenant/branding — org identity for bills/invoices/receipts and print
// letterheads. Any authenticated user of the tenant may read it (incl. the
// patient portal); the admin-only /api/tenant-settings stays the write path.
// Paystack keys live in tenants.settings JSONB and are NEVER selected here.
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("name, slug, domain, logo_url, email, phone, address, city, state, country, currency")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant) throw new ValidationError("Tenant not found");

  const website = tenant.domain || (tenant.slug ? `${tenant.slug}.${ROOT_DOMAIN}` : null);

  return ok({
    name: tenant.name,
    logo_url: tenant.logo_url,
    email: tenant.email,
    phone: tenant.phone,
    address: tenant.address,
    city: tenant.city,
    state: tenant.state,
    country: tenant.country,
    currency: tenant.currency,
    website,
  });
});

export const runtime = "nodejs";