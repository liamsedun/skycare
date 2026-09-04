import { withAuth, ok, NotFoundError, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function supplierIdFrom(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split("/");
  return segments[segments.length - 1];
}

// PATCH /api/pharmacy/admin/suppliers/[id] — edit a supplier
export const PATCH = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const id = supplierIdFrom(req);
    const { data: existing } = await ctx.svc.from("pharmacy_suppliers").select("id, name").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (!existing) throw new NotFoundError("Supplier not found");

    const body = await req.json().catch(() => null);
    if (!body) throw new ValidationError("Invalid JSON body");

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 2) throw new ValidationError("name must be at least 2 characters");
      const { data: dup } = await ctx.svc
        .from("pharmacy_suppliers")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("name_normalized", name.toLowerCase())
        .neq("id", id)
        .maybeSingle();
      if (dup) throw new ValidationError(`A supplier already exists with this name: "${dup.name}"`);
      patch.name = name;
    }
    if (body.code !== undefined) {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (code) {
        const { data: dupCode } = await ctx.svc
          .from("pharmacy_suppliers")
          .select("id, code")
          .eq("tenant_id", tenantId)
          .eq("code", code)
          .neq("id", id)
          .maybeSingle();
        if (dupCode) throw new ValidationError(`A supplier already uses code "${code}"`);
        patch.code = code;
      } else {
        patch.code = null;
      }
    }
    for (const [k, v] of [["contactPerson", "contact_person"], ["phone", "phone"], ["email", "email"], ["address", "address"], ["nafdacLicense", "nafdac_license"], ["paymentTerms", "payment_terms"]] as const) {
      if (body[k] !== undefined) patch[v] = body[k];
    }
    if (body.isActive !== undefined) patch.is_active = body.isActive;

    const { data, error } = await ctx.svc.from("pharmacy_suppliers").update({ ...patch, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id).select().single();
    if (error) throw new ValidationError(error.message);
    return ok(data);
  },
  { roles: ["hospital_admin"] }
);

// DELETE /api/pharmacy/admin/suppliers/[id] — archive (-active=false) or ?hard=1 delete
export const DELETE = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const id = supplierIdFrom(req);
    const hard = req.nextUrl.searchParams.get("hard") === "1";
    const { data: sup } = await ctx.svc.from("pharmacy_suppliers").select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (!sup) throw new NotFoundError("Supplier not found");

    if (hard) {
      const { count: batches } = await ctx.svc.from("pharmacy_stock_batches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("supplier_id", id);
      if ((batches ?? 0) > 0) throw new ValidationError("Supplier is referenced by stock batches; use archive instead");
      const { error } = await ctx.svc.from("pharmacy_suppliers").delete().eq("tenant_id", tenantId).eq("id", id);
      if (error) throw new ValidationError(error.message);
      return ok({ deleted: true });
    }

    const { error } = await ctx.svc.from("pharmacy_suppliers").update({ is_active: false, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
    if (error) throw new ValidationError(error.message);
    return ok({ archived: true });
  },
  { roles: ["hospital_admin"] }
);

export const runtime = "nodejs";