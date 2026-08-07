import { withAuth, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function getDependant(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("patients")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_primary_account", false)
    .maybeSingle();
  return data;
}

// Patients may only touch dependants in their own family.
async function assertFamilyAccess(ctx: any, dependant: any) {
  if (ctx.role !== "patient_api") return;
  const { data: self } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  const root = self?.primary_account_id ?? self?.id;
  const { data: primary } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("id", dependant.primary_account_id)
    .maybeSingle();
  const isOwn = dependant.user_id === ctx.user.id;
  const isFamily = root === dependant.primary_account_id || (primary?.primary_account_id ?? primary?.id) === root;
  if (!isOwn && !isFamily) throw new NotFoundError("Dependant not found");
}

// GET /api/dependants/[id]
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const dependant = await getDependant(ctx, id, tenantId);
  if (!dependant) throw new NotFoundError("Dependant not found");
  await assertFamilyAccess(ctx, dependant);
  return ok(dependant);
});

// PUT /api/dependants/[id]
export const PUT = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getDependant(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Dependant not found");
  await assertFamilyAccess(ctx, existing);

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "first_name", "last_name", "gender", "date_of_birth", "phone", "email",
    "blood_group", "genotype", "allergies", "chronic_conditions", "dependant_relationship", "status",
    "address", "city", "state", "emergency_contact_name", "emergency_contact_phone",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  const { data, error } = await ctx.svc
    .from("patients")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "patients",
    entityId: id,
    description: `Updated dependant ${existing.patient_number}`,
  });
  return ok(data);
});

// DELETE /api/dependants/[id] — soft remove (status = transferred, detach from family)
export const DELETE = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getDependant(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Dependant not found");
  await assertFamilyAccess(ctx, existing);

  await ctx.svc
    .from("patients")
    .update({ status: "transferred", primary_account_id: null })
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (existing.user_id) {
    await ctx.svc.from("users").update({ is_active: false }).eq("id", existing.user_id);
  }

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "patients",
    entityId: id,
    description: `Removed dependant ${existing.patient_number}`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
