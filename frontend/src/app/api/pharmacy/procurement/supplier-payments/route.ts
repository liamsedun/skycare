import { withAuth, withStaff, okPaginated, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam, resolveBankAccountId, postBankLedger } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROCUREMENT_TEAM = ["hospital_admin", "super_admin", "pharmacist", "pharmacy_tech"];
const PAYMENT_METHODS = ["bank_transfer", "cash", "pos", "credit_note"] as const;

// GET /api/pharmacy/procurement/supplier-payments?supplier_id=&from=&to=&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const supplierId = resolveParam(req.nextUrl.searchParams.get("supplier_id"));
  const dateFrom = resolveParam(req.nextUrl.searchParams.get("from"));
  const dateTo = resolveParam(req.nextUrl.searchParams.get("to"));

  let query = ctx.svc
    .from("supplier_payments")
    .select(
      `id, supplier_id, po_id, amount, method, bank_account_id, reference, notes, paid_at, created_by, created_at,
       pharmacy_suppliers(name),
       pharmacy_purchase_orders(po_number),
       hospital_bank_accounts(bank_name, account_name, account_number),
       users(full_name)`,
      { count: "exact" }
    )
    .eq("tenant_id", tenantId)
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (dateFrom) query = query.gte("paid_at", dateFrom);
  if (dateTo) query = query.lte("paid_at", dateTo);

  const { data, count } = await query;
  return okPaginated(
    (data ?? []).map((p: any) => ({
      id: p.id,
      supplierId: p.supplier_id,
      supplierName: p.pharmacy_suppliers?.name ?? "—",
      poId: p.po_id,
      poNumber: p.pharmacy_purchase_orders?.po_number ?? null,
      amount: Number(p.amount),
      method: p.method,
      bankAccountId: p.bank_account_id,
      bankLabel: p.hospital_bank_accounts
        ? `${p.hospital_bank_accounts.bank_name} •• ${p.hospital_bank_accounts.account_number}`
        : null,
      reference: p.reference,
      notes: p.notes,
      paidAt: p.paid_at,
      createdByName: p.users?.full_name ?? null,
      createdAt: p.created_at,
    })),
    count ?? 0,
    page,
    pageSize
  );
});

// POST /api/pharmacy/procurement/supplier-payments — pay a supplier now
// (bank transfer / cash / POS) or record a credit note; bank-transfer and POS
// payments debit the hospital bank ledger (banking module) when configured.
export const POST = withAuth(
  async (req, ctx) => {
    const tenantId = requireTenant(ctx);
    const body = (await req.json()) as {
      supplierId: string;
      poId?: string;
      amount: number;
      method: string;
      bankAccountId?: string;
      reference?: string;
      notes?: string;
      paidAt?: string;
    };

    if (!body.supplierId) throw new ValidationError("Supplier is required");
    if (!body.amount || Number(body.amount) <= 0) {
      throw new ValidationError("Amount must be positive");
    }
    if (!PAYMENT_METHODS.includes(body.method as (typeof PAYMENT_METHODS)[number])) {
      throw new ValidationError("Invalid payment method");
    }

    const { data: supplier } = await ctx.svc
      .from("pharmacy_suppliers")
      .select("id, name")
      .eq("id", body.supplierId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!supplier) throw new ValidationError("Supplier not found");

    if (body.poId) {
      const { data: po } = await ctx.svc
        .from("pharmacy_purchase_orders")
        .select("id, po_number")
        .eq("id", body.poId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!po) throw new ValidationError("Purchase order not found");
    }

    const amount = Math.round(Number(body.amount) * 100) / 100;
    const paidAt = body.paidAt || new Date().toISOString().slice(0, 10);
    const { data: payment, error } = await ctx.svc
      .from("supplier_payments")
      .insert({
        tenant_id: tenantId,
        branch_id: ctx.branchId ?? null,
        supplier_id: body.supplierId,
        po_id: body.poId || null,
        amount,
        method: body.method,
        bank_account_id: body.bankAccountId || null,
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
        paid_at: paidAt,
        created_by: ctx.user.id,
      })
      .select()
      .single();
    if (error) throw new ValidationError(error.message);

    // Real money methods post to the bank ledger; credit notes adjust the
    // supplier balance without moving hospital money.
    if (body.method !== "credit_note") {
      try {
        const defaultBankId = await resolveBankAccountId(ctx.svc, tenantId);
        const accountId =
          body.bankAccountId ||
          (body.method === "cash" ? null : defaultBankId);
        await postBankLedger(ctx.svc, {
          tenantId,
          branchId: ctx.branchId ?? null,
          accountId,
          direction: "out",
          amount,
          source: "supplier_payment",
          sourceRef: supplier.name,
          supplierPaymentId: payment.id,
          method: body.method,
          reference: body.reference?.trim() ?? null,
          notes: body.poId ? "Supplier payment against purchase order" : "Supplier payment",
          recordedAt: new Date(`${paidAt}T12:00:00`).toISOString(),
          createdBy: ctx.user.id,
        });
      } catch (e) {
        console.error("banking-ledger post failed", e);
      }
    }

    await logAudit(req, ctx, {
      action: "create",
      entityType: "supplier_payments",
      entityId: payment.id,
      description: `Paid ₦${amount.toLocaleString()} to ${supplier.name} (${body.method.replace(/_/g, " ")})`,
    });
    return ok(payment, 201);
  },
  { roles: PROCUREMENT_TEAM as any }
);

export const runtime = "nodejs";
