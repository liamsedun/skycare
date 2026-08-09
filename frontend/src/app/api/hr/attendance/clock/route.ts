import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/hr/attendance/clock — clock in/out for the signed-in staff member.
// body: { action: "in" | "out", window_min?: number }
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "").trim();
  if (action !== "in" && action !== "out") throw new ValidationError("action must be 'in' or 'out'");

  const windowMin = Number(body?.window_min ?? 0);
  const params =
    action === "in"
      ? { p_tenant: tenantId, p_user_id: ctx.user.id, p_window_min: Number.isFinite(windowMin) ? windowMin : 0 }
      : { p_tenant: tenantId, p_user_id: ctx.user.id };

  const { data, error } = await ctx.svc.rpc(action === "in" ? "hr_clock_in" : "hr_clock_out", params);
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "attendance",
    entityId: data?.id ?? null,
    description: action === "in" ? "Clocked in" : "Clocked out",
  });
  return ok(data);
});
