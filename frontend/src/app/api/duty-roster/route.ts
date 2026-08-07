import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
  parseBody,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { fmtDate, fmtTime } from "@/lib/shift-format";
import type { AuthedContext } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["hospital_admin", "super_admin"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const MAX_ENTRIES = 1000;

// GET /api/duty-roster?from=YYYY-MM-DD&to=YYYY-MM-DD&staff_id=&user_id=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const params = req.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const staffId = params.get("staff_id");
  const userId = params.get("user_id");

  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
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

interface RosterEntry {
  staffId: string;
  shiftDate: string;
  fromTime: string;
  untilTime: string;
  note: string | null;
}

interface RosterBody {
  entries: RosterEntry[];
  notify: boolean;
}

function validateBody(body: any): RosterBody {
  let entries: any[];
  if (Array.isArray(body?.entries)) {
    entries = body.entries;
  } else if (body?.staffId) {
    // Backward-compat: single-shift form { staffId, shiftDate, fromTime, untilTime, note }
    entries = [body];
  } else {
    throw new ValidationError("staffId + shiftDate + fromTime + untilTime are required");
  }

  if (entries.length === 0) throw new ValidationError("At least one shift is required");
  if (entries.length > MAX_ENTRIES) throw new ValidationError(`Max ${MAX_ENTRIES} shifts per request`);

  const out: RosterEntry[] = entries.map((e) => {
    if (!e?.staffId) throw new ValidationError("staffId is required");
    if (!DATE_RE.test(e?.shiftDate ?? "")) throw new ValidationError("shiftDate must be YYYY-MM-DD");
    if (!TIME_RE.test(e?.fromTime ?? "")) throw new ValidationError("fromTime must be HH:MM");
    if (!TIME_RE.test(e?.untilTime ?? "")) throw new ValidationError("untilTime must be HH:MM");
    if (e.untilTime <= e.fromTime) throw new ValidationError("untilTime must be after fromTime");
    return {
      staffId: e.staffId,
      shiftDate: e.shiftDate,
      fromTime: e.fromTime,
      untilTime: e.untilTime,
      note: e.note?.trim() || null,
    };
  });
  return { entries: out, notify: body?.notify !== false };
}

// POST /api/duty-roster — schedule one or more shifts (batch or single). Upserts on
// (staff_id, shift_date). When notify is true each assigned staff member gets an in-app
// + push notification AND an Internal Mail message summarising their shifts.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!ADMIN_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("Only hospital admins can manage the roster");
  }
  const body = validateBody(await parseBody(req));

  // Resolve tenant-scoped staff + their linked auth user ids.
  const staffIds = [...new Set(body.entries.map((e) => e.staffId))];
  const { data: staffRows, error: staffErr } = await ctx.svc
    .from("staff")
    .select("id, user_id")
    .eq("tenant_id", tenantId)
    .in("id", staffIds);
  if (staffErr) throw new ValidationError(staffErr.message);
  const userByStaff = new Map<string, string | null>();
  for (const s of staffRows ?? []) userByStaff.set(s.id, s.user_id ?? null);
  for (const id of staffIds) {
    if (!userByStaff.has(id)) throw new ValidationError("One or more staff members are not in this hospital");
  }

  const rows = body.entries.map((e) => ({
    tenant_id: tenantId,
    staff_id: e.staffId,
    user_id: userByStaff.get(e.staffId) ?? null,
    shift_date: e.shiftDate,
    from_time: e.fromTime,
    until_time: e.untilTime,
    note: e.note,
    created_by: ctx.user.id,
  }));

  const { data: created, error: insErr } = await ctx.svc
    .from("duty_roster")
    .upsert(rows, { onConflict: "staff_id,shift_date" })
    .select("id");
  if (insErr) throw new ValidationError(insErr.message);

  let notified = 0;
  if (body.notify) {
    notified = await sendRosterNotifications(req, ctx, body.entries, userByStaff);
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "duty_roster",
    description: `Scheduled ${rows.length} duty shift(s) across ${staffIds.length} staff member(s)`,
  });

  return ok({ roster: created ?? [], count: rows.length, notified }, 201);
});

async function sendRosterNotifications(
  req: NextRequest,
  ctx: AuthedContext,
  entries: RosterEntry[],
  userByStaff: Map<string, string | null>
): Promise<number> {
  const tenantId = ctx.tenantId!;
  const byUser = new Map<string, RosterEntry[]>();
  for (const e of entries) {
    const uid = userByStaff.get(e.staffId);
    if (!uid) continue;
    const list = byUser.get(uid);
    if (list) list.push(e);
    else byUser.set(uid, [e]);
  }

  let notified = 0;
  for (const [uid, shifts] of byUser) {
    const sorted = shifts.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
    const dates = [...new Set(sorted.map((s) => s.shiftDate))];

    const { data: msg, error } = await ctx.svc
      .from("internal_messages")
      .insert({
        tenant_id: tenantId,
        sender_id: ctx.user.id,
        subject: "Duty Schedule",
        body: `You are scheduled for duty:\n${sorted
          .map(
            (s) =>
              `  ${fmtDate(s.shiftDate)} · FROM ${fmtTime(s.fromTime)} UNTIL ${fmtTime(s.untilTime)}${s.note ? ` · ${s.note}` : ""}`
          )
          .join("\n")}`,
        is_broadcast: false,
        broadcast_scope: "staff",
      })
      .select()
      .single();
    if (error) continue;

    await ctx.svc.from("internal_message_recipients").insert({
      message_id: msg.id,
      recipient_id: uid,
    });

    const range =
      dates.length > 1
        ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`
        : fmtDate(dates[0]);
    await notifyUsers(ctx.svc, {
      orgId: tenantId,
      userIds: [uid],
      type: "duty_schedule",
      title: "You have been scheduled for duty",
      message: `DATE: ${range}, TIME: FROM ${fmtTime(sorted[0].fromTime)} UNTIL ${fmtTime(sorted[0].untilTime)}`,
      referenceType: "internal_message",
      referenceId: msg.id,
    });
    notified += 1;
  }
  return notified;
}

export const runtime = "nodejs";