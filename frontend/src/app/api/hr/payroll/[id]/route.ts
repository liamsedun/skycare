import { withStaff, ok, ValidationError, ForbiddenError, NotFoundError, requireTenant, resolveBankAccountId, bankLedgerAccountForMethod, postBankLedger } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isHrAdmin } from "@/lib/hr-perms";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECORD_SELECT =
  "id, staff_id, pay_period, run_number, pay_date, base_salary, allowances, deductions, overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, status, generated_at, approved_by, notes, paye, pension_ee, pension_employer, nhf, nhis, nhis_employer, other_deductions, internal_deductions_total, tax_relief, annual_gross, chargeable_income, effective_rate_pct, calc, staff:staff(staff_number, users(full_name, role, email))";

const r2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/hr/payroll/[id] — payslip with lines (own or HR admin/accountant).
// PUT — adjust allowances/bonus/deductions, approve (freeze), unapprove or pay (HR admin).
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;

  const { data, error } = await ctx.svc
    .from("payroll_records")
    .select(RECORD_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!data) throw new NotFoundError("Payroll record not found");

  if (!isHrAdmin(ctx.role)) {
    const { data: me } = await ctx.svc.from("staff").select("id").eq("user_id", ctx.user.id).eq("tenant_id", tenantId).maybeSingle();
    if (!me || me.id !== data.staff_id) throw new ForbiddenError("You can only view your own payslip");
  }

  const { data: lines } = await ctx.svc.from("payroll_lines").select("id, line_type, label, amount").eq("payroll_id", id).order("created_at");
  return ok({ ...data, lines: lines ?? [] });
});

export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  if (!isHrAdmin(ctx.role)) throw new ForbiddenError("HR admin access required");
  const body = await req.json().catch(() => null);

  const { data: rec, error: recError } = await ctx.svc
    .from("payroll_records")
    .select("id, base_salary, allowances, deductions, overtime_pay, bonus, pay_period, net_salary, status, run_number, notes, pay_date, calc")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (recError) throw new ValidationError(recError.message);
  if (!rec) throw new NotFoundError("Payroll record not found");

  const recCalc = (rec.calc ?? {}) as Record<string, number>;
  const calcNet = Number.isFinite(Number(recCalc.netPay)) ? Number(recCalc.netPay) : Number(rec.net_salary);
  const recAllow = Number(rec.allowances) || 0;
  const recDed = Number(rec.deductions) || 0;
  const recBonus = Number(rec.bonus) || 0;

  const patch: Record<string, unknown> = {};

  if (body?.status != null) {
    const status = String(body.status).trim();
    if (!["draft", "approved", "paid"].includes(status)) throw new ValidationError("Invalid status");

    if (status === "approved") {
      if (rec.status === "paid") throw new ValidationError("Paid payroll cannot be approved");
      const { count } = await ctx.svc
        .from("payroll_lines")
        .select("id", { count: "exact", head: true })
        .eq("payroll_id", id)
        .eq("tenant_id", tenantId);
      if ((count ?? 0) === 0) throw new ValidationError("Cannot approve — run payroll first (no lines)");
      patch.status = "approved";
      patch.approved_by = ctx.user.id;
    } else if (status === "draft") {
      if (rec.status === "paid") throw new ValidationError("Paid payroll cannot be reverted to draft");
      patch.status = "draft";
    } else if (status === "paid") {
      const okToPay = rec.status === "approved" || rec.status === "paid";
      if (!okToPay) throw new ValidationError("Payroll must be approved before it can be paid");
      patch.status = "paid";
      patch.approved_by = ctx.user.id;
    }
  }

  if (body?.allowances != null || body?.bonus != null || body?.deductions != null) {
    if (rec.status === "paid" || rec.status === "approved") {
      throw new ValidationError("Payroll adjustments are only allowed while the record is a draft");
    }
    const allowances = body?.allowances != null ? Number(body.allowances) : rec.allowances;
    const bonus = body?.bonus != null ? Number(body.bonus) : rec.bonus;
    const deductions = body?.deductions != null ? Number(body.deductions) : rec.deductions;
    if ([allowances, bonus, deductions].some((v) => !Number.isFinite(v) || v < 0)) {
      throw new ValidationError("allowances/bonus/deductions must be positive numbers");
    }
    patch.allowances = r2(allowances);
    patch.bonus = r2(bonus);
    patch.deductions = r2(deductions);
    const overtime = Number.isFinite(Number(rec.overtime_pay)) ? Number(rec.overtime_pay) : 0;
    patch.net_salary = r2(calcNet + (allowances - recAllow) + (bonus - recBonus) - (deductions - recDed) + overtime);
  }

  if (body?.notes != null) patch.notes = String(body.notes).trim() || null;

  let finalNet = rec.net_salary;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await ctx.svc
      .from("payroll_records")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id, net_salary, status, run_number, pay_period")
      .single();
    if (error) throw new ValidationError(error.message);
    finalNet = Number(data.net_salary);
    if (body?.status === "paid") {
      const { count } = await ctx.svc
        .from("hospital_bank_ledger")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("payroll_id", id)
        .eq("source", "payroll");
      if ((count ?? 0) === 0) {
        const defaultBankId = await resolveBankAccountId(ctx.svc, tenantId);
        await postBankLedger(ctx.svc, {
          tenantId,
          branchId: ctx.branchId ?? null,
          accountId: bankLedgerAccountForMethod("bank_transfer", defaultBankId),
          direction: "out",
          amount: finalNet,
          source: "payroll",
          sourceRef: `Payroll for ${rec.pay_period}`,
          payrollId: id,
          method: defaultBankId ? "bank_transfer" : "cash",
          reference: `PR-${(rec.run_number ?? id).replace(/^PR-/, "").padStart(4, "0")}`,
          notes: rec.notes,
          recordedAt: new Date().toISOString(),
          createdBy: ctx.user.id,
        });
      }
    }
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "payroll_records",
    entityId: id,
    changes: patch,
    description: body?.status != null ? `Payroll ${body.status}` : "Adjusted payroll record",
  });
  const { data: final } = await ctx.svc
    .from("payroll_records")
    .select("status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return ok({ id, net_salary: finalNet, status: final?.status ?? rec.status });
});