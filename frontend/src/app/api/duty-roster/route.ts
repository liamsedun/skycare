import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["hospital_admin", "super_admin"];

// GET /api/duty-roster?from=YYYY-MM-DD&to=YYYY-MM-DD&staff_id=&user_id=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const params = req.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const staffId = params.get("staff_id");
  const userId = params.get("user_id");

  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    throw new ValidationError("from/to must be YYYY-MM-DD");
  }

  let query = ctx.svc
    .from("duty_roster")
    .select(
      "*, staff!duty_roster_staff_id_fkey(id, staff_number, department, users(id, full_name, role)), users!duty_roster_user_id_fkey(id, full_name, role)",
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("shift_date", { ascending: true })
    .order("from_time", { ascending: true });

  if (from) query = query.gte("shift_date", from);
  if (to) query = query.lte("shift_date", to);
  if (staffId) query = query.eq("staff_id", staffId);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw new ValidationError(error.message);
  return ok(data ?? []);
});

interface RosterBody {
  staffId: string;
  userId?: string;
  shiftDate: string;
  fromTime: string;
  untilTime: string;
  note?: string;
}

function validateBody(body: any): RosterBody {
  if (!body?.staffId) throw new ValidationError("staffId is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.shiftDate ?? "")) throw new ValidationError("shiftDate must be YYYY-MM-DD");
  if (!/^\d{2}:\d{2}$/.test(body?.fromTime ?? "")) throw new ValidationError("fromTime must be HH:MM");
  if (!/^\d{2}:\d{2}$/.test(body?.untilTime ?? "")) throw new ValidationError("untilTime must be HH:MM");
  return {
    staffId: body.staffId,
    userId: body.userId ?? null,
    shiftDate: body.shiftDate,
    fromTime: body.fromTime,
    untilTime: body.untilTime,
    note: body.note?.trim() || null,
  };
}

// POST /api/duty-roster — assign a shift (upsert on staff_id + shift_date)
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) throw new ForbiddenError("Only hospital admins can manage the roster");
  const body = validateBody(await req.json());

  const { data, error } = await ctx.svc
    .from("duty_roster")
    .upsert(
      {
        tenant_id: tenantId,
        staff_id: body.staffId,
        user_id: body.userId,
        shift_date: body.shiftDate,
        from_time: body.fromTime,
        until_time: body.untilTime,
        note: body.note,
        created_by: ctx.user.id,
      },
      { onConflict: "staff_id,shift_date" }
    )
    .select("id")
    .single();
  if (error) throw new ValidationError(error.message);

  await logAudit(req, ctx, {
    action: body.userId ? "update" : "create",
    entityType: "duty_roster",
    entityId: data.id,
    description: `Assigned shift ${body.fromTime}–${body.untilTime} on ${body.shiftDate}`,
  });

  return ok(data, 201);
});

export const runtime = "nodejs";