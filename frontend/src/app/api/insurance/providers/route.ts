import { withStaff, ok, okPaginated, ValidationError, requireTenant, getPagination, resolveParam, sanitizeLike } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROVIDER_SELECT = "id, name, code, provider_type, contact_name, contact_phone, contact_email, address, payment_terms_days, is_active, notes, created_at, updated_at";

// GET /api/insurance/providers?search=&type=&active=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const search = resolveParam(req.nextUrl.searchParams.get("search"));
  const type = resolveParam(req.nextUrl.searchParams.get("type"));
  const active = resolveParam(req.nextUrl.searchParams.get("active"));

  let query = ctx.svc
    .from("insurance_providers")
    .select(PROVIDER_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
    .range(from, to);

  if (search) query = query.ilike("name", `%${sanitizeLike(search)}%`);
  if (type) query = query.eq("provider_type", type);
  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface ProviderBody {
  name: string;
  code?: string | null;
  providerType: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  paymentTermsDays?: number;
  isActive?: boolean;
  notes?: string | null;
}

function validateProviderBody(body: any): ProviderBody {
  if (!body?.name?.trim()) throw new ValidationError("Name is required");
  if (!body?.providerType?.trim()) throw new ValidationError("Provider type is required");
  if (!["nhia", "hmo", "private"].includes(body.providerType.trim())) {
    throw new ValidationError("Provider type must be nhia, hmo, or private");
  }
  if (body.paymentTermsDays !== undefined && body.paymentTermsDays !== null) {
    const d = Number(body.paymentTermsDays);
    if (!Number.isFinite(d) || d < 0) throw new ValidationError("Payment terms days must be a non-negative number");
  }
  return {
    name: body.name.trim(),
    code: body.code?.trim() || null,
    providerType: body.providerType.trim(),
    contactName: body.contactName?.trim() || null,
    contactPhone: body.contactPhone?.trim() || null,
    contactEmail: body.contactEmail?.trim() || null,
    address: body.address?.trim() || null,
    paymentTermsDays: body.paymentTermsDays ?? 30,
    isActive: body.isActive ?? true,
    notes: body.notes?.trim() || null,
  };
}

// POST /api/insurance/providers
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = validateProviderBody(await req.json());

  const { data: existing } = await ctx.svc
    .from("insurance_providers")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", body.name)
    .maybeSingle();
  if (existing) throw new ValidationError("A provider with this name already exists");

  const { data, error } = await ctx.svc
    .from("insurance_providers")
    .insert({
      tenant_id: tenantId,
      name: body.name,
      code: body.code,
      provider_type: body.providerType,
      contact_name: body.contactName,
      contact_phone: body.contactPhone,
      contact_email: body.contactEmail,
      address: body.address,
      payment_terms_days: body.paymentTermsDays,
      is_active: body.isActive,
      notes: body.notes,
    })
    .select(PROVIDER_SELECT)
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "insurance_providers",
    entityId: data.id,
    description: `Created insurance provider: ${body.name}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";
