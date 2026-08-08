import { withStaff, ok, okPaginated, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REGISTER_SELECT = `
id, drug_id, patient_id, prescription_id, quantity_dispensed, balance_after,
quantity_received, source_supplier, prescriber_name, pharmacist_id, notes, branch_id, created_at,
pharmacy_drugs(name, control_schedule, nafdac_number),
patients(patient_number, first_name, last_name),
users(full_name)`;

// GET /api/pharmacy/compliance/register?drugId=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const drugId = resolveParam(req.nextUrl.searchParams.get("drugId"));

  let query = ctx.svc
    .from("controlled_drug_register")
    .select(REGISTER_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (drugId) query = query.eq("drug_id", drugId);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "view",
    entityType: "controlled_drug_register",
    entityId: `${tenantId}`,
    description: "Viewed controlled drug register",
  });

  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const runtime = "nodejs";