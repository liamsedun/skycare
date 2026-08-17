import {
  withAuth,
  requireTenant,
  ok,
  err,
  parseBody,
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

function adminOnly(role: string): void {
  if (role !== "hospital_admin" && role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

async function syncPrimaryDomain(
  svc: { from: (t: string) => any },
  tenantId: string,
  domain: string | null
): Promise<void> {
  await svc.from("tenants").update({ domain }).eq("id", tenantId);
}

export const PUT = withAuth(async (req, ctx) => {
  adminOnly(ctx.role);
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const body = await parseBody<{ isPrimary?: boolean }>(req);
  if (body.isPrimary !== true) throw new ValidationError("Only isPrimary=true is supported here");

  const { data: domain, error: getErr } = await ctx.svc
    .from("tenant_domains")
    .select("id, domain")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !domain) throw new NotFoundError("Domain not found");

  const { error: unsetErr } = await ctx.svc
    .from("tenant_domains")
    .update({ is_primary: false })
    .eq("tenant_id", tenantId);
  if (unsetErr) return err(unsetErr.message, 500);

  const { data, error } = await ctx.svc
    .from("tenant_domains")
    .update({ is_primary: true })
    .eq("id", id)
    .select()
    .single();
  if (error) return err(error.message, 500);

  await syncPrimaryDomain(ctx.svc, tenantId, domain.domain);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "tenant_domain",
    entityId: id,
    description: `Set primary domain ${domain.domain}`,
  });
  return ok(data);
});

export const DELETE = withAuth(async (req, ctx) => {
  adminOnly(ctx.role);
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: domain, error: getErr } = await ctx.svc
    .from("tenant_domains")
    .select("id, domain, is_primary")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (getErr || !domain) throw new NotFoundError("Domain not found");

  const { error } = await ctx.svc.from("tenant_domains").delete().eq("id", id);
  if (error) return err(error.message, 500);

  if (domain.is_primary) {
    const { data: next } = await ctx.svc
      .from("tenant_domains")
      .select("domain")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    await syncPrimaryDomain(ctx.svc, tenantId, next?.domain ?? null);
  }

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "tenant_domain",
    entityId: id,
    description: `Released custom domain ${domain.domain}`,
  });
  return ok({ ok: true });
});