import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STAFF = 100;
const MAX_DAYS = 31;
const MAX_PAIRS = 1000;

// POST /api/hr/roster/bulk — assign a shift template to many staff across a date range (HR admin).
// Body: { shift_id, from_date, to_date, staff_ids: string[], notes? }
// Returns { assigned: rows[], skipped: [{staff_id, date, reason}], errors: [{staff_id, date, message}], total }
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const body = await req.json().catch(() => null);
  const shiftId = String(body?.shift_id ?? "").trim();
  const fromDate = String(body?.from_date ?? "").trim();
  const toDate = String(body?.to_date ?? "").trim();
  const staffIds = Array.isArray(body?.staff_ids) ? body.staff_ids.map(String).filter(Boolean) : [];
  const notes = String(body?.notes ?? "").trim() || undefined;

  if (!shiftId) throw new ValidationError("shift_id is required");
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) throw new ValidationError("from_date and to_date are required (YYYY-MM-DD)");
  if (toDate < fromDate) throw new ValidationError("to_date cannot be before from_date");
  if (staffIds.length === 0) throw new ValidationError("Select at least one staff member");
  if (staffIds.length > MAX_STAFF) throw new ValidationError(`At most ${MAX_STAFF} staff members per bulk assignment`);

  const dayDiff = Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) + 1;
  if (dayDiff > MAX_DAYS) throw new ValidationError(`Date range can span at most ${MAX_DAYS} days`);
  if (staffIds.length * dayDiff > MAX_PAIRS) throw new ValidationError(`Too many assignments (${staffIds.length} staff × ${dayDiff} days exceeds ${MAX_PAIRS})`);

  const { data: shift, error: shiftErr } = await ctx.svc
    .from("shifts")
    .select("id, name")
    .eq("id", shiftId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (shiftErr) throw new ValidationError(shiftErr.message);
  if (!shift) throw new ValidationError("Shift template not found");

  const dates: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00Z`); d <= new Date(`${toDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const assigned: unknown[] = [];
  const skipped: { staff_id: string; date: string; reason: string }[] = [];
  const errors: { staff_id: string; date: string; message: string }[] = [];

  for (const staffId of staffIds) {
    for (const date of dates) {
      const { data, error } = await ctx.svc.rpc("hr_assign_shift", {
        p_tenant: tenantId,
        p_staff_id: staffId,
        p_shift_id: shiftId,
        p_date: date,
        p_ward_id: null,
        p_notes: notes ?? null,
        p_created_by: ctx.user.id,
      });
      if (error) {
        const msg = String(error.message ?? "");
        if (/SHIFT_CONFLICT|duplicate key/i.test(msg)) {
          skipped.push({ staff_id: staffId, date, reason: "Already assigned on this date" });
        } else {
          errors.push({ staff_id: staffId, date, message: msg });
        }
      } else {
        assigned.push(data);
      }
    }
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "staff_shifts",
    entityId: `bulk/${assigned.length}/${skipped.length}`,
    changes: { shift_id: shiftId, from_date: fromDate, to_date: toDate, staff: staffIds.length, skipped: skipped.length },
    description: `Bulk-assigned ${shift.name}: ${assigned.length} shifts created, ${skipped.length} skipped`,
  });

  return ok({ assigned, skipped, errors, total: assigned.length });
});