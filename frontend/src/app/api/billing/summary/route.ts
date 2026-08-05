import { withAuth, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BILLING_ROLES = ["hospital_admin", "cashier", "super_admin"];

function monthRange(raw: string | null): { from: string; to: string } {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  if (raw && !m) throw new ValidationError("month must be YYYY-MM");
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) : now.getUTCMonth() + 1;
  if (month < 1 || month > 12) throw new ValidationError("month must be 01-12");
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// GET /api/billing/summary?month=YYYY-MM — revenue snapshot (admin/cashier)
export const GET = withAuth(async (req, ctx) => {
  if (!BILLING_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("You do not have permission to view billing summary");
  }
  const tenantId = requireTenant(ctx);
  const { from, to } = monthRange(req.nextUrl.searchParams.get("month"));

  const [paidRes, outstandingRes, monthPaymentsRes, monthIncomeRes, invoicesRes] = await Promise.all([
    ctx.svc
      .from("payments")
      .select("amount")
      .eq("tenant_id", tenantId)
      .eq("status", "completed"),
    ctx.svc
      .from("invoices")
      .select("total_amount, paid_amount")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "partially_paid"]),
    ctx.svc
      .from("payments")
      .select("amount, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("paid_at", `${from}T00:00:00`)
      .lte("paid_at", `${to}T23:59:59.999`),
    ctx.svc
      .from("other_income")
      .select("amount")
      .eq("tenant_id", tenantId)
      .gte("income_date", from)
      .lte("income_date", to),
    ctx.svc
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  if (paidRes.error || outstandingRes.error || monthPaymentsRes.error || monthIncomeRes.error || invoicesRes.error) {
    throw new ValidationError("Failed to compute billing summary");
  }

  const collected = (paidRes.data ?? []).reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);
  const outstanding = (outstandingRes.data ?? []).reduce(
    (sum: number, inv: { total_amount: number; paid_amount: number }) => sum + (Number(inv.total_amount) - Number(inv.paid_amount)),
    0
  );
  const monthCollected = (monthPaymentsRes.data ?? []).reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);
  const monthOtherIncome = (monthIncomeRes.data ?? []).reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);

  return ok({
    collected: Math.round(collected * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    monthCollected: Math.round(monthCollected * 100) / 100,
    monthOtherIncome: Math.round(monthOtherIncome * 100) / 100,
    monthTotal: Math.round((monthCollected + monthOtherIncome) * 100) / 100,
    invoiceCount: invoicesRes.count ?? 0,
  });
});

export const runtime = "nodejs";