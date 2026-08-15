import { withStaff, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const r2 = (n: number) => Math.round(n * 100) / 100;
const MAX_IDS = 500;

type BulkAction = "approve" | "delete" | "edit";

interface BulkRecord {
  id: string;
  status: string;
  allowances: number;
  deductions: number;
  overtime_pay: number;
  bonus: number;
  net_salary: number;
  calc: Record<string, unknown> | null;
  notes: string | null;
}

// POST /api/hr/payroll/bulk — bulk approve / delete / edit drafted payroll
// records (HR admin). Body: { action, ids, payload? }.
//  - approve: drafts only → status 'approved' + approved_by (approved/paid skipped).
//  - delete:  drafts only → record + payroll_lines removed via FK cascade.
//  - edit:    drafts only → payload { allowances?, bonus?, deductions?,
//             overtime_pay?, notes? } overrides the stored values; net_salary is
//             recomputed as a delta over the engine's calc.netPay, matching the
//             single-record [id] PUT semantics.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");

  const body = await req.json().catch(() => null);
  const action: BulkAction = String(body?.action ?? "").trim() as BulkAction;
  if (!["approve", "delete", "edit"].includes(action)) throw new ValidationError("action must be approve, delete or edit");

  const rawIds = Array.isArray(body?.ids) ? (body.ids as unknown[]).map(String).filter(Boolean) : [];
  if (rawIds.length === 0) throw new ValidationError("ids cannot be empty");
  if (rawIds.length > MAX_IDS) throw new ValidationError(`ids limited to ${MAX_IDS} records`);
  const ids = [...new Set(rawIds)];

  const { data: recs, error: recErr } = await ctx.svc
    .from("payroll_records")
    .select("id, status, allowances, deductions, overtime_pay, bonus, net_salary, calc, notes")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (recErr) throw new ValidationError(recErr.message);

  const byId = new Map<string, BulkRecord>((recs ?? []).map((r) => [r.id, { ...r, calc: (r.calc ?? {}) as Record<string, unknown> }]));
  const skipped: Array<{ id: string; reason: string }> = [];
  const errors: Array<{ id: string; message: string }> = [];
  let processed = 0;
  const calcNet = (r: BulkRecord) => {
    const c = r.calc ?? {};
    const n = Number((c as Record<string, number>).netPay);
    return Number.isFinite(n) ? n : Number(r.net_salary) || 0;
  };

  if (action === "approve" || action === "delete") {
    for (const id of ids) {
      const rec = byId.get(id);
      if (!rec) { skipped.push({ id, reason: "not found" }); continue; }
      if (rec.status === "approved") {
        skipped.push({ id, reason: action === "approve" ? "already approved" : "approved — unapprove before deleting" });
        continue;
      }
      if (rec.status === "paid") {
        skipped.push({ id, reason: "paid run — cannot be processed" });
        continue;
      }
      if (action === "approve") {
        const { count } = await ctx.svc
          .from("payroll_lines")
          .select("id", { count: "exact", head: true })
          .eq("payroll_id", id)
          .eq("tenant_id", tenantId);
        if ((count ?? 0) === 0) { skipped.push({ id, reason: "no payroll lines — run payroll first" }); continue; }
        const { error: updErr } = await ctx.svc
          .from("payroll_records")
          .update({ status: "approved", approved_by: ctx.user.id })
          .eq("id", id)
          .eq("tenant_id", tenantId);
        if (updErr) { errors.push({ id, message: updErr.message }); continue; }
        processed += 1;
      } else {
        const { data: deleted, error: delErr } = await ctx.svc
          .from("payroll_records")
          .delete()
          .eq("id", id)
          .eq("tenant_id", tenantId)
          .select("id");
        if (delErr) { errors.push({ id, message: delErr.message }); continue; }
        if ((deleted ?? []).length === 0) { skipped.push({ id, reason: "not found" }); continue; }
        processed += 1;
      }
    }
  } else {
    const payload = (body?.payload ?? {}) as Record<string, unknown>;
    const wantAllow = payload.allowances != null;
    const wantBonus = payload.bonus != null;
    const wantDed = payload.deductions != null;
    const wantOt = payload.overtime_pay != null;
    const wantNotes = payload.notes != null;
    if (!wantAllow && !wantBonus && !wantDed && !wantOt && !wantNotes) {
      throw new ValidationError("edit requires at least one field in payload (allowances, bonus, deductions, overtime_pay, notes)");
    }
    const num = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    };
    const allow = wantAllow ? num(payload.allowances) : undefined;
    const bonus = wantBonus ? num(payload.bonus) : undefined;
    const ded = wantDed ? num(payload.deductions) : undefined;
    const ot = wantOt ? num(payload.overtime_pay) : undefined;
    if ([allow, bonus, ded, ot].some((v) => v === null)) {
      throw new ValidationError("allowances/bonus/deductions/overtime_pay must be positive numbers");
    }

    for (const id of ids) {
      const rec = byId.get(id);
      if (!rec) { skipped.push({ id, reason: "not found" }); continue; }
      if (rec.status !== "draft") {
        skipped.push({ id, reason: rec.status === "approved" ? "approved — unapprove first" : "paid — cannot be edited" });
        continue;
      }
      const patch: Record<string, unknown> = {};
      const newAllow = allow ?? (Number(rec.allowances) || 0);
      const newBonus = bonus ?? (Number(rec.bonus) || 0);
      const newDed = ded ?? (Number(rec.deductions) || 0);
      const newOt = ot ?? (Number(rec.overtime_pay) || 0);
      patch.allowances = r2(newAllow);
      patch.bonus = r2(newBonus);
      patch.deductions = r2(newDed);
      patch.overtime_pay = r2(newOt);
      patch.net_salary = r2(
        calcNet(rec) +
          (newAllow - (Number(rec.allowances) || 0)) +
          (newBonus - (Number(rec.bonus) || 0)) -
          (newDed - (Number(rec.deductions) || 0)) +
          (newOt - (Number(rec.overtime_pay) || 0))
      );
      if (wantNotes) patch.notes = payload.notes == null || String(payload.notes).trim() === "" ? null : String(payload.notes).trim();
      const { error: updErr } = await ctx.svc.from("payroll_records").update(patch).eq("id", id).eq("tenant_id", tenantId);
      if (updErr) { errors.push({ id, message: updErr.message }); continue; }
      processed += 1;
    }
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "payroll_records",
    entityId: null,
    changes: { action, count: processed, ids: [...new Set([...ids])] },
    description: `Bulk-${action === "approve" ? "approved" : action === "delete" ? "deleted" : "edited"} ${processed} payroll record(s)`,
  });

  return ok({ action, processed, skipped, errors });
});