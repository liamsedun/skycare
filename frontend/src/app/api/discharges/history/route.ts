import { withStaff, ok, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/discharges/history — recent discharges with patient + ward-invoice embeds (staff).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data, error } = await ctx.svc
    .from("discharges")
    .select(
      "id, admission_id, summary, medications, follow_up, discharged_at, " +
      "admission(patients(first_name, last_name, patient_number), " +
      "invoices(invoice_number, total_amount, status))"
    )
    .eq("tenant_id", tenantId)
    .order("discharged_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ok(data ?? []);
});