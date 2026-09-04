import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROVIDER_SELECT = "id, name, code, provider_type, contact_name, contact_phone, contact_email, address, payment_terms_days, is_active, notes, created_at, updated_at";

function idFrom(req: NextRequest): string {
  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  return segs[segs.length - 1];
}

// GET /api/insurance/providers/[id]
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data, error } = await ctx.svc
    .from("insurance_providers")
    .select(PROVIDER_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Insurance provider not found");
  return ok(data);
});

// PUT /api/insurance/providers/[id]
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);
  const body = await req.json();

  const { data: existing } = await ctx.svc
    .from("insurance_providers")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Insurance provider not found");

  const patch: Record<string, any> = {};
  if (body.name !== undefined) {
    if (!body.name?.trim()) throw new ValidationError("Name is required");
    patch.name = body.name.trim();
  }
  if (body.code !== undefined) patch.code = body.code?.trim() || null;
  if (body.providerType !== undefined) {
    if (!["nhia", "hmo", "private"].includes(body.providerType)) {
      throw new ValidationError("Provider type must be nhia, hmo, or private");
    }
    patch.provider_type = body.providerType;
  }
  if (body.contactName !== undefined) patch.contact_name = body.contactName?.trim() || null;
  if (body.contactPhone !== undefined) patch.contact_phone = body.contactPhone?.trim() || null;
  if (body.contactEmail !== undefined) patch.contact_email = body.contactEmail?.trim() || null;
  if (body.address !== undefined) patch.address = body.address?.trim() || null;
  if (body.paymentTermsDays !== undefined) {
    const d = Number(body.paymentTermsDays);
    if (!Number.isFinite(d) || d < 0) throw new ValidationError("Payment terms days must be a non-negative number");
    patch.payment_terms_days = d;
  }
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  if (Object.keys(patch).length === 0) {
    throw new ValidationError("No fields to update");
  }

  if (patch.name) {
    const { data: dup } = await ctx.svc
      .from("insurance_providers")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", patch.name)
      .neq("id", id)
      .maybeSingle();
    if (dup) throw new ValidationError("A provider with this name already exists");
  }

  const { data, error } = await ctx.svc
    .from("insurance_providers")
    .update(patch)
    .eq("id", id)
    .select(PROVIDER_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "insurance_providers",
    entityId: id,
    description: `Updated insurance provider: ${data.name}`,
  });

  return ok(data);
});

// DELETE /api/insurance/providers/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = idFrom(req);

  const { data: existing } = await ctx.svc
    .from("insurance_providers")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!existing) throw new NotFoundError("Insurance provider not found");

  const { count: policyCount } = await ctx.svc
    .from("insurance_policies")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", id)
    .eq("tenant_id", tenantId);
  if ((policyCount ?? 0) > 0) {
    throw new ValidationError("Cannot delete provider with existing policies. Remove or transfer policies first.");
  }

  const { error } = await ctx.svc.from("insurance_providers").delete().eq("id", id);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "insurance_providers",
    entityId: id,
    description: `Deleted insurance provider: ${existing.name}`,
  });

  return ok({ ok: true });
});

export const runtime = "nodejs";
