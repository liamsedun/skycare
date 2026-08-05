import { withAuth, okPaginated, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PAYMENT_SELECT =
  "id, tenant_id, branch_id, invoice_id, patient_id, amount, payment_method, status, reference, gateway, paid_by, paid_at, created_at, updated_at, invoices(id, invoice_number, total_amount, paid_amount, status), patients(id, patient_number, first_name, last_name)";

// GET /api/payments?invoice_id=&patient_id=&status=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const invoiceId = resolveParam(req.nextUrl.searchParams.get("invoice_id"));
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));

  let familyIds: string[] | null = null;
  if (ctx.role === "patient_api") {
    const { data } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id);
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id);
      if (row.primary_account_id) ids.add(row.primary_account_id);
    }
    if (ids.size === 0) return okPaginated([], 0, page, pageSize);
    familyIds = Array.from(ids);
  }

  let query = ctx.svc
    .from("payments")
    .select(PAYMENT_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("paid_at", { ascending: false })
    .range(from, to);

  if (invoiceId) query = query.eq("invoice_id", invoiceId);
  if (patientId) query = query.eq("patient_id", patientId);
  if (status) query = query.eq("status", status);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const runtime = "nodejs";
