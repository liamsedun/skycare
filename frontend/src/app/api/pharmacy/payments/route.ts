import { withStaff, ok, okPaginated, ValidationError, NotFoundError, requireTenant, getPagination, resolveParam, sanitizeLike } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { tenantCurrency } from "@/lib/server-currency";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const METHOD_MAP: Record<string, string> = {
  cash: "cash",
  pos: "pos",
  transfer: "transfer",
  card: "card",
  insurance: "insurance",
};

interface PaymentSplit {
  method: "cash" | "pos" | "transfer" | "card" | "insurance";
  amount: number;
  reference?: string;
  notes?: string;
}

export interface RecordPharmacyPaymentsBody {
  invoiceId: string;
  payments: PaymentSplit[];
  branchId?: string | null;
  bankAccountId?: string | null;
}

// POST /api/pharmacy/payments — record one or more payment splits against a
// pharmacy invoice. Overpaying is rejected by the engine; the invoice is
// auto-closed when fully paid. Payments sync to the central ledger row.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { symbol } = await tenantCurrency(ctx.svc, tenantId);
  const body = (await req.json()) as RecordPharmacyPaymentsBody;

  if (!body.invoiceId) throw new ValidationError("invoiceId is required");
  if (!Array.isArray(body.payments) || body.payments.length === 0) {
    throw new ValidationError("At least one payment split is required");
  }
  for (const p of body.payments) {
    if (!p.method || !(p.method in METHOD_MAP)) {
      throw new ValidationError(`Invalid payment method: ${p.method}`);
    }
    if (!Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) {
      throw new ValidationError("Each payment split needs a positive amount");
    }
  }

  const { data: invoice } = await ctx.svc
    .from("pharmacy_invoices")
    .select("id, invoice_number, patient_id, total_amount, synced_invoice_id")
    .eq("id", body.invoiceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!invoice) throw new NotFoundError("Pharmacy invoice not found");

  const { data: paymentIds, error } = await ctx.svc.rpc("pharmacy_invoice_pay", {
    p_tenant_id: tenantId,
    p_invoice_id: body.invoiceId,
    p_payments: body.payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference?.trim() || null,
      notes: p.notes?.trim() || null,
    })),
    p_user_id: ctx.user.id,
    p_branch_id: body.branchId ?? null,
  });
  if (error) throw new ValidationError(error.message);

  const { data: afterInvoice, error: afterError } = await ctx.svc
    .from("pharmacy_invoices")
    .select("id, total_amount, paid_amount, status, paid_at, patient_id, invoice_number")
    .eq("id", body.invoiceId)
    .single();
  if (afterError || !afterInvoice) throw new ValidationError(afterError?.message ?? "Invoice not found");

  // Dedicated bank-account ledger: pick the target account — an explicit
  // "cash" keeps the credit on the cash side (account_id NULL); an explicit
  // bank uuid credits that bank; nothing sent falls back to the first active
  // account (legacy default) so every payment is reconcilable.
  let bankAccountId: string | null = null;
  if (body.bankAccountId === "cash") {
    bankAccountId = null;
  } else if (body.bankAccountId && body.bankAccountId !== "") {
    bankAccountId = body.bankAccountId;
  } else {
    const { data: defaultAccount } = await ctx.svc
      .from("hospital_bank_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    bankAccountId = defaultAccount?.id ?? null;
  }

  // Central-ledger sync: mirror each split as a central payment row, post the
  // bank-ledger credit, and keep the mirrored invoice's status in lockstep.
  if (invoice.synced_invoice_id) {
    for (let i = 0; i < body.payments.length; i++) {
      const p = body.payments[i];
      const { data: centralPayment, error: syncError } = await ctx.svc
        .from("payments")
        .insert({
          tenant_id: tenantId,
          branch_id: body.branchId ?? null,
          invoice_id: invoice.synced_invoice_id,
          patient_id: invoice.patient_id,
          amount: Number(p.amount),
          payment_method: METHOD_MAP[p.method],
          status: "completed",
          reference: p.reference?.trim() || null,
          gateway: "pharmacy",
          paid_by: ctx.user.id,
          paid_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (!syncError && centralPayment && paymentIds?.[i]) {
        await ctx.svc
          .from("pharmacy_payments")
          .update({ synced_payment_id: centralPayment.id })
          .eq("id", paymentIds[i]);
      }
    }
    await ctx.svc
      .from("invoices")
      .update({
        paid_amount: Number(afterInvoice.paid_amount),
        status:
          Number(afterInvoice.paid_amount) >= Number(invoice.total_amount) - 0.01
            ? "paid"
            : Number(afterInvoice.paid_amount) > 0
              ? "partially_paid"
              : "pending",
      })
      .eq("id", invoice.synced_invoice_id);
  }

  // Bank ledger rows (best-effort but never silent): one 'in' credit per
  // payment split, tied to the pharmacy payment row for full traceability.
  try {
    for (let i = 0; i < body.payments.length; i++) {
      const p = body.payments[i];
      if (!paymentIds?.[i]) continue;
      await ctx.svc.from("pharmacy_bank_ledger").insert({
        tenant_id: tenantId,
        branch_id: body.branchId ?? null,
        account_id: bankAccountId,
        direction: "in",
        amount: Number(p.amount),
        source: "pharmacy_payment",
        source_ref: afterInvoice.invoice_number,
        invoice_id: afterInvoice.id,
        payment_id: paymentIds[i],
        method: p.method,
        reference: p.reference?.trim() || null,
        notes: `Payment received on ${afterInvoice.invoice_number}`,
        created_by: ctx.user.id,
      });
    }
  } catch (e) {
    console.error("bank-ledger post failed", e);
  }

  const totalPaid = body.payments.reduce((s, p) => s + Number(p.amount), 0);
  if (afterInvoice.patient_id) {
    const { data: patient } = await ctx.svc
      .from("patients")
      .select("user_id, primary_account_id")
      .eq("id", afterInvoice.patient_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const userIds = new Set<string>();
    if (patient?.user_id) userIds.add(patient.user_id);
    if (patient?.primary_account_id && patient.primary_account_id !== afterInvoice.patient_id) {
      const { data: root } = await ctx.svc
        .from("patients")
        .select("user_id")
        .eq("id", patient.primary_account_id)
        .maybeSingle();
      if (root?.user_id) userIds.add(root.user_id);
    }
    if (userIds.size > 0) {
      await notifyUsers(ctx.svc, {
        orgId: tenantId,
        userIds: Array.from(userIds),
        type: "payment_confirmed",
        title: "Pharmacy payment received",
        message: `${afterInvoice.invoice_number} — ${symbol}${totalPaid.toLocaleString()} received. A receipt is available in your portal.`,
        referenceType: "invoices",
        referenceId: invoice.synced_invoice_id ?? null,
      });
    }
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "pharmacy_payments",
    entityId: paymentIds?.[0],
    description: `Pharmacy payment ${symbol}${totalPaid.toLocaleString()} (${body.payments.length} split(s)) on ${invoice.invoice_number}`,
  });

  return ok({ paymentIds, invoice: afterInvoice }, 201);
});

// GET /api/pharmacy/payments?q=&invoiceId=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&pageSize=
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from: rangeFrom, to: rangeTo } = getPagination(req.nextUrl.searchParams);
  const invoiceId = resolveParam(req.nextUrl.searchParams.get("invoiceId"));
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim() || null;
  const from = resolveParam(req.nextUrl.searchParams.get("from"))?.trim() || null;
  const to = resolveParam(req.nextUrl.searchParams.get("to"))?.trim() || null;
  if (from && to && from > to) throw new ValidationError("from must be on or before to");

  let patientOrInvoiceIds: string[] | null = null;
  if (q) {
    const like = `%${sanitizeLike(q)}%`;
    const patRes = await ctx.svc
      .from("patients")
      .select("id")
      .eq("tenant_id", tenantId)
      .or(`first_name.ilike.${like},last_name.ilike.${like},patient_number.ilike.${like}`);
    if (patRes.error) throw new ValidationError("Failed to search payments");
    const patientIds = (patRes.data ?? []).map((r) => r.id);

    const [invRes, invByPatRes] = await Promise.all([
      ctx.svc.from("pharmacy_invoices").select("id").eq("tenant_id", tenantId).ilike("invoice_number", like).limit(500),
      patientIds.length > 0
        ? ctx.svc.from("pharmacy_invoices").select("id").eq("tenant_id", tenantId).in("patient_id", patientIds).limit(500)
        : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
    ]);
    if (invRes.error || invByPatRes.error) throw new ValidationError("Failed to search payments");

    const ids = new Set<string>();
    for (const r of [...(invRes.data ?? []), ...(invByPatRes.data ?? [])]) ids.add(r.id);
    patientOrInvoiceIds = Array.from(ids);
  }

  let query = ctx.svc
    .from("pharmacy_payments")
    .select("id, invoice_id, amount, method, reference, status, received_by, received_at, notes, pharmacy_invoices(invoice_number, patients(first_name, last_name))", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("received_at", { ascending: false });
  if (invoiceId) query = query.eq("invoice_id", invoiceId);
  if (from) query = query.gte("received_at", `${from}T00:00:00`);
  if (to) query = query.lte("received_at", `${to}T23:59:59.999`);
  if (q) {
    const ors = ["reference.ilike.%" + sanitizeLike(q) + "%", "invoice_id.in.(" + (patientOrInvoiceIds ?? []).join(",") + ")"];
    query = query.or(patientOrInvoiceIds && patientOrInvoiceIds.length > 0 ? ors.join(",") : ors[0]);
  }
  const { data, count, error } = await query.range(rangeFrom, rangeTo);
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export const runtime = "nodejs";