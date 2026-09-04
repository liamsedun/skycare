import { withAuth, requireTenant, ForbiddenError, ok, err, parseBody, ValidationError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { invalidateDoctorsCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Landing doctors — the tenant's public website profiles.
// GET: admin listing (used by Settings). POST: create a doctor.
// The public /[slug] site reads active doctors server-side via the service
// client (tenant-scoped) — no anonymous endpoint is exposed.

export const GET = withAuth(async (_req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);

  const { data, error } = await ctx.svc
    .from("landing_doctors")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });

  if (error) return err(error.message, 500);
  return ok(data);
});

export const POST = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);

  const body = await parseBody<{
    name: string;
    specialty: string;
    available?: boolean;
    availability?: string;
    image_url?: string;
    sort_order?: number;
    is_active?: boolean;
  }>(req);

  const name = body.name?.trim();
  if (!name) throw new ValidationError("Name is required");
  if (!body.specialty?.trim()) throw new ValidationError("Specialty is required");

  const { data, error } = await ctx.svc
    .from("landing_doctors")
    .insert({
      tenant_id: tenantId,
      name,
      specialty: body.specialty.trim(),
      available: body.available ?? true,
      availability: body.availability ?? "",
      image_url: body.image_url ?? null,
      sort_order: body.sort_order ?? 0,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) return err(error.message, 500);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "landing_doctors",
    entityId: data.id,
    description: "Added website doctor",
  });

  await invalidateDoctorsCache(tenantId);

  return ok(data, 201);
});
