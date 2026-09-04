import {
  withAuth,
  requireTenant,
  ok,
  err,
  parseBody,
  ValidationError,
  ForbiddenError,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_DOMAINS = 5;

function adminOnly(role: string): void {
  if (role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return d;
}

/** Mirror the active primary domain into tenants.domain (the resolver reads it). */
async function syncPrimaryDomain(
  svc: { from: (t: string) => any },
  tenantId: string,
  domain: string | null
): Promise<void> {
  await svc.from("tenants").update({ domain }).eq("id", tenantId);
}

export const GET = withAuth(async (_req, ctx) => {
  adminOnly(ctx.role);
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("tenant_domains")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return err(error.message, 500);
  return ok(data);
});

export const POST = withAuth(async (req, ctx) => {
  adminOnly(ctx.role);
  const tenantId = requireTenant(ctx);

  const body = await parseBody<{ domain?: string; isPrimary?: boolean }>(req);
  const domain = normalizeDomain(body.domain ?? "");
  if (!DOMAIN_RE.test(domain)) {
    throw new ValidationError("Enter a valid domain like example.com or www.example.com");
  }

  const { data: existing, error: countErr } = await ctx.svc
    .from("tenant_domains")
    .select("id")
    .eq("tenant_id", tenantId);
  if (countErr) return err(countErr.message, 500);
  if (existing.length >= MAX_DOMAINS) {
    throw new ValidationError(`You can have up to ${MAX_DOMAINS} domains`);
  }

  const { data: dup, error: dupErr } = await ctx.svc
    .from("tenant_domains")
    .select("id")
    .eq("domain", domain)
    .maybeSingle();
  if (dupErr) return err(dupErr.message, 500);
  if (dup) throw new ValidationError("This domain is already claimed by another hospital");

  const isPrimary = body.isPrimary === true || existing.length === 0;
  const { data, error } = await ctx.svc
    .from("tenant_domains")
    .insert({ tenant_id: tenantId, domain, is_primary: isPrimary })
    .select()
    .single();
  if (error) return err(error.message, 500);

  if (isPrimary) await syncPrimaryDomain(ctx.svc, tenantId, domain);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "tenant_domain",
    entityId: data.id,
    description: `Claimed custom domain ${domain}`,
  });
  return ok(data, 201);
});