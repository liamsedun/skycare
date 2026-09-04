import {
  withAuth,
  requireTenant,
  ok,
  err,
  ForbiddenError,
} from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("website_pages")
    .select("id, slug, title, published, updated_at")
    .eq("tenant_id", tenantId)
    .order("slug", { ascending: true });
  if (error) return err(error.message, 500);
  return ok(data);
});