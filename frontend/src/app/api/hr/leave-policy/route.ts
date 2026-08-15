import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const LEAVE_POLICY_TYPES = ["annual", "sick", "emergency", "study", "maternity", "paternity", "unpaid"] as const;
export const LEAVE_POLICY_DEFAULTS: Record<string, number> = {
  annual: 21,
  sick: 10,
  emergency: 3,
  study: 5,
  maternity: 60,
  paternity: 5,
  unpaid: 0,
};
export const LEAVE_POLICY_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  emergency: "Emergency",
  study: "Study",
  maternity: "Maternity",
  paternity: "Paternity",
  unpaid: "Unpaid",
};

export interface LeavePolicyBody {
  days: Record<string, number>;
}

// GET /api/hr/leave-policy — annual entitled days per leave type (HR staff).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { data } = await ctx.svc
    .from("hr_leave_type_policy")
    .select("leave_type, entitled_days, updated_at")
    .eq("tenant_id", tenantId);
  const saved = new Map((data ?? []).map((r) => [r.leave_type, r]));
  const rows = LEAVE_POLICY_TYPES.map((t) => ({
    leave_type: t,
    label: LEAVE_POLICY_LABELS[t],
    entitled_days: Number(saved.get(t)?.entitled_days ?? LEAVE_POLICY_DEFAULTS[t]),
  }));
  return ok({ rows });
});

// PUT /api/hr/leave-policy — save entitlements, then re-sync all balances
// (entitled_days propagates to every staff member's leave_balances for the
// current year; used_days is untouched).
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ValidationError("HR admin access required to change leave policy");

  const body = (await req.json().catch(() => null)) as LeavePolicyBody | null;
  if (!body || typeof body.days !== "object" || body.days === null) {
    throw new ValidationError("days object is required");
  }

  const rows: Array<{ tenant_id: string; leave_type: string; entitled_days: number; updated_by: string | null }> = [];
  for (const t of LEAVE_POLICY_TYPES) {
    const raw = body.days[t];
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      throw new ValidationError(`${LEAVE_POLICY_LABELS[t]} days must be between 0 and 365`);
    }
    rows.push({ tenant_id: tenantId, leave_type: t, entitled_days: n, updated_by: ctx.user.id });
  }
  if (rows.length === 0) throw new ValidationError("No leave types to update");

  const { error } = await ctx.svc
    .from("hr_leave_type_policy")
    .upsert(rows, { onConflict: "tenant_id,leave_type" });
  if (error) throw new ValidationError(error.message);

  const { error: syncErr } = await ctx.svc.rpc("hr_sync_leave_balances", { p_tenant: tenantId });
  if (syncErr) throw new ValidationError(syncErr.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "hr_leave_type_policy",
    entityId: `${tenantId}`,
    description: `Updated annual leave entitlements: ${rows.map((r) => `${r.leave_type}=${r.entitled_days}`).join(", ")}`,
  });

  const { data } = await ctx.svc
    .from("hr_leave_type_policy")
    .select("leave_type, entitled_days, updated_at")
    .eq("tenant_id", tenantId);
  const saved = new Map((data ?? []).map((r) => [r.leave_type, r]));
  const out = LEAVE_POLICY_TYPES.map((t) => ({
    leave_type: t,
    label: LEAVE_POLICY_LABELS[t],
    entitled_days: Number(saved.get(t)?.entitled_days ?? LEAVE_POLICY_DEFAULTS[t]),
  }));
  return ok({ rows: out, synced: true });
});