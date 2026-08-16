import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = ["complete", "cancel", "delete"] as const;
type BulkAction = (typeof ACTIONS)[number];

const PAST_TENSE: Record<BulkAction, string> = {
  complete: "Completed",
  cancel: "Cancelled",
  delete: "Deleted",
};

// POST /api/hr/roster/bulk-status — bulk mark-complete / cancel / delete on
// shift assignments (HR admin). Mirrors the single-row PUT/DELETE semantics:
// complete only applies to 'scheduled' rows, cancel flips any non-cancelled
// row, delete removes rows outright. Returns processed + per-id skip reasons.
export const POST = withStaff(async (req: NextRequest, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const body = await req.json().catch(() => null);
  const action = String(body?.action ?? "").trim() as BulkAction;
  if (!ACTIONS.includes(action)) throw new ValidationError("action must be complete, cancel or delete");

  const rawIds: unknown[] = Array.isArray(body?.ids) ? (body.ids as unknown[]) : [];
  const unique: string[] = [];
  for (const x of rawIds) {
    const s = String(x ?? "").trim();
    if (s) unique.push(s);
  }
  if (unique.length === 0) throw new ValidationError("ids are required");
  const uniqueIds = [...new Set(unique)];
  if (uniqueIds.length > 500) throw new ValidationError("At most 500 assignments per call");

  const { data: rows, error } = await ctx.svc
    .from("staff_shifts")
    .select("id, status, shift_date, staff_id")
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);
  if (error) throw new ValidationError(error.message);

  const byId = new Map<string, { status: string }>();
  for (const r of rows ?? []) byId.set(r.id, r);

  const processed: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) {
      skipped.push({ id, reason: "not found" });
      continue;
    }
    if (action === "complete") {
      if (row.status === "completed") {
        skipped.push({ id, reason: "already completed" });
        continue;
      }
      if (row.status !== "scheduled") {
        skipped.push({ id, reason: "only scheduled shifts can be marked complete" });
        continue;
      }
      const { error: ue } = await ctx.svc
        .from("staff_shifts")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (ue) throw new ValidationError(ue.message);
      processed.push(id);
      continue;
    }
    if (action === "cancel") {
      if (row.status === "cancelled") {
        skipped.push({ id, reason: "already cancelled" });
        continue;
      }
      const { error: ue } = await ctx.svc
        .from("staff_shifts")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (ue) throw new ValidationError(ue.message);
      processed.push(id);
      continue;
    }
    const { error: de } = await ctx.svc
      .from("staff_shifts")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (de) throw new ValidationError(de.message);
    processed.push(id);
  }

  const processedIds = [...new Set(processed)];
  await logAudit(req, ctx, {
    action: action === "delete" ? "delete" : "update",
    entityType: "staff_shifts",
    entityId: null,
    changes: { action, count: processedIds.length, ids: processedIds },
    description: `${PAST_TENSE[action]} ${processedIds.length} shift assignment(s)`,
  });

  return ok({ action, processed: processedIds.length, skipped, total: processedIds.length + skipped.length });
});
