import { withStaff, withAuth, ok, requireTenant, ValidationError } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/pharmacy/admin/prices?drugId=&branchId= — price overrides
// ---------------------------------------------------------------------------
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const drugId = req.nextUrl.searchParams.get("drugId");
  const branchId = req.nextUrl.searchParams.get("branchId");

  let q = ctx.svc
    .from("pharmacy_price_overrides")
    .select("id, drug_id, branch_id, unit_price, note, created_at, pharmacy_drugs(name), branches(name)")
    .eq("tenant_id", tenantId);
  if (drugId) q = q.eq("drug_id", drugId);
  if (branchId === "null") q = q.is("branch_id", null);
  else if (branchId) q = q.eq("branch_id", branchId);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) return ok(data ?? [], 500);

  return ok((data ?? []).map((o: any) => ({
    id: o.id,
    drugId: o.drug_id,
    drugName: o.pharmacy_drugs?.name ?? "—",
    branchId: o.branch_id,
    branchName: o.branches?.name ?? "All branches",
    unitPrice: Number(o.unit_price ?? 0),
    note: o.note,
  })));
});

// ---------------------------------------------------------------------------
// POST /api/pharmacy/admin/prices { drugId, branchId|null, unitPrice, note }
// Upsert semantics: replaces any existing override for that (branch, drug).
// ---------------------------------------------------------------------------
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = await req.json().catch(() => null);
    if (!body) throw new ValidationError("Invalid JSON body");

    const drugId = typeof body.drugId === "string" ? body.drugId : "";
    if (!drugId) throw new ValidationError("drugId is required");
    const unitPrice = Number(body.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new ValidationError("unitPrice must be 0 or greater");
    const branchId = typeof body.branchId === "string" && body.branchId ? body.branchId : null;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;

    const { data: drug } = await ctx.svc.from("pharmacy_drugs").select("id").eq("tenant_id", tenantId).eq("id", drugId).maybeSingle();
    if (!drug) throw new ValidationError("Drug not found");
    if (branchId) {
      const { data: branch } = await ctx.svc.from("branches").select("id").eq("tenant_id", tenantId).eq("id", branchId).maybeSingle();
      if (!branch) throw new ValidationError("Branch not found");
    }

    // upsert against the expression-unique scope: find, update, else insert
    const { data: existing } = await ctx.svc
      .from("pharmacy_price_overrides")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("drug_id", drugId)
      .eq("branch_id", branchId)
      .maybeSingle();

    const payload = {
      tenant_id: tenantId,
      drug_id: drugId,
      branch_id: branchId,
      unit_price: Math.round(unitPrice * 100) / 100,
      note,
      created_by: ctx.user.id,
    };

    if (existing) {
      const { data, error } = await ctx.svc
        .from("pharmacy_price_overrides")
        .update({ unit_price: payload.unit_price, note, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new ValidationError(error.message);
      return ok(data);
    }

    const { data, error } = await ctx.svc.from("pharmacy_price_overrides").insert(payload).select().single();
    if (error) throw new ValidationError(error.message);
    return ok(data, 201);
  },
  { roles: ["hospital_admin"] }
);

export const runtime = "nodejs";