import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getTest(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("lab_tests")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

// GET /api/lab-tests/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const test = await getTest(ctx, id, tenantId);
  if (!test) throw new NotFoundError("Lab test not found");
  return ok(test);
});

// PUT /api/lab-tests/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getTest(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Lab test not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = ["name", "category", "price", "reference_range", "is_active"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  const { data: updated, error } = await ctx.svc
    .from("lab_tests")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "lab_tests",
    entityId: id,
    description: `Updated lab test "${existing.name}"`,
  });

  return ok(updated);
});

// DELETE /api/lab-tests/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getTest(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Lab test not found");

  await ctx.svc.from("lab_tests").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "lab_tests",
    entityId: id,
    description: `Deleted lab test "${existing.name}"`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
