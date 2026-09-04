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

function slugFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

function adminOnly(role: string): void {
  if (role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
}

const SLUG_RE = /^[a-z0-9-]+$/;

export const GET = withAuth(async (req, ctx) => {
  adminOnly(ctx.role);
  const tenantId = requireTenant(ctx);
  const slug = slugFrom(req);
  const { data, error } = await ctx.svc
    .from("website_pages")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return err(error.message, 500);
  if (!data) throw new NotFoundError("Page not found");
  return ok(data);
});

export const PUT = withAuth(async (req, ctx) => {
  adminOnly(ctx.role);
  const tenantId = requireTenant(ctx);
  const slug = slugFrom(req);
  if (!SLUG_RE.test(slug)) throw new ValidationError("Invalid page slug");

  const body = await parseBody<{
    title?: string;
    content?: { paragraphs?: string[] };
    seo_title?: string | null;
    seo_description?: string | null;
    published?: boolean;
  }>(req);

  const title = body.title?.trim();
  if (!title) throw new ValidationError("Title is required");

  const patch = {
    title,
    content:
      body.content && Array.isArray(body.content.paragraphs)
        ? { paragraphs: body.content.paragraphs.map((p) => String(p ?? "")) }
        : undefined,
    seo_title: body.seo_title?.trim() || null,
    seo_description: body.seo_description?.trim() || null,
    published: body.published ?? true,
    updated_at: new Date().toISOString(),
  };
  if (patch.content === undefined) delete patch.content;

  const { data, error } = await ctx.svc
    .from("website_pages")
    .upsert({ tenant_id: tenantId, slug, ...patch }, { onConflict: "tenant_id,slug" })
    .select()
    .single();
  if (error) return err(error.message, 500);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "website_page",
    entityId: data.id,
    description: `Saved website page "${slug}"`,
  });
  return ok(data, 200);
});