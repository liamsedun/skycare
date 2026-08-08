import { withStaff, withAuth, ok, requireTenant, ValidationError } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/pharmacy/admin/suppliers?includeInactive=1 — tenant's suppliers
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";
  let q = ctx.svc
    .from("pharmacy_suppliers")
    .select("id, tenant_id, branch_id, name, code, contact_person, phone, email, address, nafdac_license, payment_terms, is_active, created_at")
    .eq("tenant_id", tenantId);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) return ok([], 500);
  return ok((data ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    contactPerson: s.contact_person,
    phone: s.phone,
    email: s.email,
    address: s.address,
    nafdacLicense: s.nafdac_license,
    paymentTerms: s.payment_terms,
    isActive: s.is_active,
  })));
});

// POST /api/pharmacy/admin/suppliers — add a local supplier (admin only)
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = await req.json().catch(() => null);
    if (!body) throw new ValidationError("Invalid JSON body");

    const str = (v: unknown, max = 200): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const name = str(body.name, 200);
    if (!name) throw new ValidationError("name is required");
    if (name.length < 2) throw new ValidationError("name must be at least 2 characters");
    const code = str(body.code, 50);

    const { data: dup } = await ctx.svc
      .from("pharmacy_suppliers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("name_normalized", name.toLowerCase())
      .maybeSingle();
    if (dup) throw new ValidationError(`A supplier already exists with this name: "${dup.name}"`);
    if (code) {
      const { data: dupCode } = await ctx.svc
        .from("pharmacy_suppliers")
        .select("id, code")
        .eq("tenant_id", tenantId)
        .eq("code", code)
        .maybeSingle();
      if (dupCode) throw new ValidationError(`A supplier already uses code "${code}"`);
    }

    const { data, error } = await ctx.svc
      .from("pharmacy_suppliers")
      .insert({
        tenant_id: tenantId,
        name,
        code,
        contact_person: str(body.contactPerson, 200) ?? null,
        phone: str(body.phone, 50) ?? null,
        email: str(body.email, 200) ?? null,
        address: str(body.address, 500) ?? null,
        nafdac_license: str(body.nafdacLicense, 100) ?? null,
        payment_terms: str(body.paymentTerms, 100) ?? "net 30",
      })
      .select()
      .single();
    if (error) throw new ValidationError(error.message);
    return ok(data, 201);
  },
  { roles: ["hospital_admin", "super_admin"] }
);

export const runtime = "nodejs";