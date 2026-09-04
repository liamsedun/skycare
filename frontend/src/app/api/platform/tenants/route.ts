import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, okPaginated, getPagination, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const { page, pageSize, from, to } = getPagination(sp);
  const search = sp.get("search")?.trim();
  const status = sp.get("status");
  const plan = sp.get("plan");

  let query = svc.from("tenants").select("*", { count: "exact" });

  if (search) {
    query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (status) {
    query = query.eq("subscription_status", status);
  }
  if (plan) {
    query = query.eq("plan", plan);
  }

  const { data: tenants, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(error.message, 500);

  // Enrich with user counts and invoice totals
  const enriched = await Promise.all(
    (tenants || []).map(async (t: any) => {
      const { count: userCount } = await svc
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.id);

      const { count: patientCount } = await svc
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", t.id);

      const { data: invoices } = await svc
        .from("subscription_invoices")
        .select("amount, discount_amount, status")
        .eq("tenant_id", t.id);

      const totalPaid = (invoices || [])
        .filter((i: any) => i.status === "completed")
        .reduce((sum: number, i: any) => sum + Number(i.amount) - Number(i.discount_amount || 0), 0);

      const outstanding = (invoices || [])
        .filter((i: any) => i.status === "pending")
        .reduce((sum: number, i: any) => sum + Number(i.amount) - Number(i.discount_amount || 0), 0);

      return {
        ...t,
        userCount: userCount || 0,
        patientCount: patientCount || 0,
        totalPaid,
        outstanding,
      };
    })
  );

  return okPaginated(enriched, count || 0, page, pageSize);
});
