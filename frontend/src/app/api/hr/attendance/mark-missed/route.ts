import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/hr/attendance/mark-missed — run the auto-absence sync (HR admin).
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const { data, error } = await ctx.svc.rpc("hr_mark_missed_shifts", {
    p_tenant: tenantId,
    p_branch: ctx.branchId ?? null,
  });
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, { action: "update", entityType: "attendance", entityId: null, description: `Auto-marked ${data ?? 0} absent shift(s)` });
  return ok({ marked: data ?? 0 });
});
