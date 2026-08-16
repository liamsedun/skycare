import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/hr/roster?month=YYYY-MM — monthly shift assignments (any staff).
// GET /api/hr/roster?from=YYYY-MM-DD&to=YYYY-MM-DD — exact-range window
//   (per-day / per-week calendar views); falls back to month bounds.
// POST /api/hr/roster — assign staff to a shift (HR admin); guards: no double
// booking, no duty_roster clash (both enforced table-level).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const from = req.nextUrl.searchParams.get("from")?.trim();
  const to = req.nextUrl.searchParams.get("to")?.trim();
  let fromDate: string;
  let toDate: string;
  if (from && to) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new ValidationError("from/to must be YYYY-MM-DD");
    }
    if (from > to) throw new ValidationError("from cannot be after to");
    fromDate = from;
    toDate = to;
  } else {
    const month = req.nextUrl.searchParams.get("month")?.trim() || new Date().toISOString().slice(0, 7);
    fromDate = `${month}-01`;
    toDate = `${month}-31`;
  }
  const { data, error } = await ctx.svc
    .from("staff_shifts")
    .select("id, staff_id, shift_id, ward_id, shift_date, status, notes, staff:staff(department, users(full_name, role)), shift:shifts(name, start_time, end_time, color), ward:wards(name)")
    .eq("tenant_id", tenantId)
    .gte("shift_date", fromDate)
    .lte("shift_date", toDate)
    .order("shift_date")
    .order("start_time", { foreignTable: "shifts", ascending: true })
    .limit(2000);
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);
  const staffId = String(body?.staff_id ?? "").trim();
  const shiftId = String(body?.shift_id ?? "").trim();
  const shiftDate = String(body?.shift_date ?? "").trim();
  if (!staffId || !shiftId || !shiftDate) throw new ValidationError("staff_id, shift_id and shift_date are required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) throw new ValidationError("shift_date must be YYYY-MM-DD");

  const { data, error } = await ctx.svc.rpc("hr_assign_shift", {
    p_tenant: tenantId,
    p_staff_id: staffId,
    p_shift_id: shiftId,
    p_date: shiftDate,
    p_ward_id: body?.ward_id ?? null,
    p_notes: String(body?.notes ?? "").trim() || null,
    p_created_by: ctx.user.id,
  });
  if (error) {
    if (/SHIFT_CONFLICT/.test(error.message)) {
      throw new ValidationError("Shift conflict: staff already has a duty roster entry that day");
    }
    if (/duplicate key/.test(error.message)) {
      throw new ValidationError("Staff is already assigned on this date");
    }
    throw new ValidationError(error.message);
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "staff_shifts",
    entityId: data?.id ?? null,
    changes: { staff_id: staffId, shift_id: shiftId, shift_date: shiftDate },
    description: "Assigned shift",
  });
  return ok(data, 201);
});
