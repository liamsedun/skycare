import { withStaff, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const COVERAGE_SELECT =
  "id, provider_name, drug_id, is_covered, co_pay_type, co_pay_value, max_qty_per_claim, pharmacy_drugs(name, generic_name)";

const VALID_CO_PAY = ["percent", "fixed", "none"];

// GET /api/pharmacy/insurance/coverage?provider=&drugId=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const provider = req.nextUrl.searchParams.get("provider");
  const drugId = req.nextUrl.searchParams.get("drugId");

  let query = ctx.svc
    .from("insurance_coverage")
    .select(COVERAGE_SELECT)
    .eq("tenant_id", tenantId)
    .order("provider_name")
    .order("drug_id");
  if (provider) query = query.eq("provider_name", provider);
  if (drugId) query = query.eq("drug_id", drugId);

  const { data, error } = await query;
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

// POST /api/pharmacy/insurance/coverage — upsert a formulary rule
// { providerName, drugId, isCovered, coPayType, coPayValue?, maxQtyPerClaim? }
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as {
    providerName: string;
    drugId: string;
    isCovered: boolean;
    coPayType: "percent" | "fixed" | "none";
    coPayValue?: number;
    maxQtyPerClaim?: number;
  };

  if (!body.providerName?.trim() || !body.drugId) {
    throw new ValidationError("providerName and drugId are required");
  }
  if (!VALID_CO_PAY.includes(body.coPayType)) {
    throw new ValidationError("coPayType must be percent, fixed or none");
  }

  const { data: drug } = await ctx.svc
    .from("pharmacy_drugs")
    .select("id")
    .eq("id", body.drugId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!drug) throw new NotFoundError("Drug not found");

  const { data, error } = await ctx.svc
    .from("insurance_coverage")
    .upsert(
      {
        tenant_id: tenantId,
        provider_name: body.providerName.trim(),
        drug_id: body.drugId,
        is_covered: body.isCovered,
        co_pay_type: body.coPayType,
        co_pay_value: ["percent", "fixed"].includes(body.coPayType)
          ? Number(body.coPayValue) || 0
          : 0,
        max_qty_per_claim: body.maxQtyPerClaim ? Math.floor(Number(body.maxQtyPerClaim)) : null,
        created_by: ctx.user.id,
      },
      { onConflict: "tenant_id,provider_name,drug_id" }
    )
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "insurance_coverage",
    entityId: data.id,
    description: `Formulary rule ${data.provider_name} / ${data.is_covered ? "covered" : "NOT covered"}`,
  });

  return ok(data, 201);
});

// DELETE /api/pharmacy/insurance/coverage?id=
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ValidationError("id is required");
  const { error } = await ctx.svc
    .from("insurance_coverage")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  if (error) throw new ValidationError(error.message);
  await logAudit(req, ctx, {
    action: "delete",
    entityType: "insurance_coverage",
    entityId: id,
    description: "Formulary rule removed",
  });
  return ok({ deleted: true });
});

export const runtime = "nodejs";