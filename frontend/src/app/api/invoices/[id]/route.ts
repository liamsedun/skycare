import { withAuth, withStaff, ok, ValidationError, NotFoundError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit, logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INVOICE_SELECT =
  "id, tenant_id, branch_id, patient_id, invoice_number, issue_date, due_date, status, subtotal, tax_amount, discount_amount, total_amount, paid_amount, insurance_claimable, notes, created_by, attending_staff_id, created_at, updated_at, patients(id, patient_number, first_name, last_name, gender, phone, email), invoice_items(id, description, quantity, unit_price, total_price, vat_percent, vat_amount), payments(id, amount, payment_method, status, reference, paid_at)";

async function getInvoice(ctx: any, id: string, tenantId: string) {
  const { data } = await ctx.svc
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

async function canView(ctx: any, invoice: any): Promise<boolean> {
  if (ctx.role !== "patient_api") return true;
  const { data } = await ctx.svc
    .from("patients")
    .select("id, primary_account_id")
    .eq("user_id", ctx.user.id);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    ids.add(row.id);
    if (row.primary_account_id) ids.add(row.primary_account_id);
  }
  return invoice?.patient_id ? ids.has(invoice.patient_id) : false;
}

// GET /api/invoices/[id]
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const id = req.nextUrl.pathname.split("/").pop()!;
  const invoice = await getInvoice(ctx, id, tenantId);
  if (!invoice) throw new NotFoundError("Invoice not found");
  if (!(await canView(ctx, invoice))) throw new NotFoundError("Invoice not found");
  await logView(req, ctx, "invoices", id, `Viewed invoice ${invoice.invoice_number}`);
  return ok(invoice);
});

// PUT /api/invoices/[id] — status / notes / amounts; items replace when provided
export const PUT = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "billing", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getInvoice(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Invoice not found");

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = ["status", "due_date", "notes", "subtotal", "tax_amount", "discount_amount", "total_amount"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
  }

  if (patch.status && !["draft", "pending", "partially_paid", "paid", "cancelled", "refunded"].includes(patch.status as string)) {
    throw new ValidationError("Invalid invoice status");
  }

  const { data: updated, error } = await ctx.svc
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  if (Array.isArray(body.items)) {
    if (body.items.length === 0) throw new ValidationError("Items cannot be empty");
    await ctx.svc.from("invoice_items").delete().eq("invoice_id", id);
    const items = (body.items as Array<Record<string, unknown>>).map((item) => ({
      invoice_id: id,
      description: String(item.description),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      total_price: Number(item.total_price ?? Number(item.quantity) * Number(item.unit_price)),
      vat_percent: Number(item.vat_percent ?? 0),
      vat_amount: Number(item.vat_amount ?? 0),
    }));
    const { error: itemsError } = await ctx.svc.from("invoice_items").insert(items);
    if (itemsError) throw new ValidationError(itemsError.message);
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "invoices",
    entityId: id,
    description:
      typeof patch.status === "string"
        ? `Invoice ${existing.invoice_number} status set to ${patch.status}`
        : `Invoice ${existing.invoice_number} updated`,
  });

  return ok(await getInvoice(ctx, id, tenantId));
});

// DELETE /api/invoices/[id]
export const DELETE = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "billing", "full");
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getInvoice(ctx, id, tenantId);
  if (!existing) throw new NotFoundError("Invoice not found");

  await ctx.svc.from("invoices").delete().eq("id", id).eq("tenant_id", tenantId);

  await logAudit(req, ctx, {
    action: "delete",
    entityType: "invoices",
    entityId: id,
    description: `Invoice ${existing.invoice_number} deleted`,
  });
  return ok({ ok: true });
});

export const runtime = "nodejs";
