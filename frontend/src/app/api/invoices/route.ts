import { withAuth, withStaff, okPaginated, ok, ValidationError, NotFoundError, requireTenant } from "@/lib/api-utils";
import { getPagination, resolveParam } from "@/lib/api-utils";
import { CLINICIAN_ROLES } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getTenantSettings, generateInvoiceNumber } from "@/lib/tenant-settings";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const INVOICE_SELECT =
  "id, tenant_id, branch_id, patient_id, invoice_number, issue_date, due_date, status, subtotal, tax_amount, discount_amount, total_amount, paid_amount, insurance_claimable, notes, created_by, attending_staff_id, created_at, updated_at, patients(id, patient_number, first_name, last_name, gender, phone, user_id), invoice_items(id, description, quantity, unit_price, total_price, vat_percent, vat_amount), payments(id, amount, payment_method, status, reference, paid_at)";

// GET /api/invoices?patient_id=&status=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const patientId = resolveParam(req.nextUrl.searchParams.get("patient_id"));
  const status = resolveParam(req.nextUrl.searchParams.get("status"));

  let familyIds: string[] | null = null;
  if (ctx.role === "patient_api") {
    const { data } = await ctx.svc
      .from("patients")
      .select("id, primary_account_id")
      .eq("user_id", ctx.user.id);
    const ids = new Set<string>();
    for (const row of data ?? []) {
      ids.add(row.id);
      if (row.primary_account_id) ids.add(row.primary_account_id);
    }
    if (ids.size === 0) return okPaginated([], 0, page, pageSize);
    familyIds = Array.from(ids);
  }

  let query = ctx.svc
    .from("invoices")
    .select(INVOICE_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);
  if (patientId) query = query.eq("patient_id", patientId);
  if (familyIds) query = query.in("patient_id", familyIds);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateInvoiceItemBody {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vat_percent?: number;
  vat_amount?: number;
}

export interface CreateInvoiceBody {
  patientId: string;
  issueDate?: string;
  dueDate?: string;
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  attendingStaffId?: string;
  notes?: string;
  status?: string;
  items: CreateInvoiceItemBody[];
}

// POST /api/invoices
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as CreateInvoiceBody;

  if (!body.patientId || body.subtotal == null || body.totalAmount == null) {
    throw new ValidationError("Patient, subtotal and total are required");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ValidationError("At least one invoice item is required");
  }
  for (const item of body.items) {
    if (!item.description?.trim() || item.quantity <= 0 || item.unit_price < 0) {
      throw new ValidationError("Each item needs a description, quantity and unit price");
    }
  }

  const { data: patient } = await ctx.svc
    .from("patients")
    .select("id, first_name, last_name")
    .eq("id", body.patientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!patient) throw new NotFoundError("Patient not found");

  if (body.attendingStaffId) {
    const { data: doctor } = await ctx.svc
      .from("users")
      .select("id, role")
      .eq("id", body.attendingStaffId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (!doctor || !["hospital_admin", "nurse", ...CLINICIAN_ROLES].includes(doctor.role)) {
      throw new ValidationError("Invalid attending staff selected");
    }
  }

  const settings = await getTenantSettings(ctx.svc, tenantId);
  const invoiceNumber = await generateInvoiceNumber(ctx.svc, tenantId, settings.invoicePrefix);

  const { data: invoice, error } = await ctx.svc
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      branch_id: ctx.branchId ?? null,
      patient_id: body.patientId,
      invoice_number: invoiceNumber,
      issue_date: body.issueDate || new Date().toISOString().slice(0, 10),
      due_date: body.dueDate || null,
      status: body.status || "pending",
      subtotal: body.subtotal,
      tax_amount: body.taxAmount ?? 0,
      discount_amount: body.discountAmount ?? 0,
      total_amount: body.totalAmount,
      paid_amount: 0,
      insurance_claimable: false,
      notes: body.notes?.trim() || null,
      created_by: ctx.user.id,
      attending_staff_id: body.attendingStaffId || null,
    })
    .select()
    .single();
  if (error) throw new ValidationError(error.message);

  const items = body.items.map((item) => ({
    invoice_id: invoice.id,
    description: item.description.trim(),
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price ?? item.quantity * item.unit_price,
    vat_percent: item.vat_percent ?? 0,
    vat_amount: item.vat_amount ?? 0,
  }));
  const { data: createdItems, error: itemsError } = await ctx.svc
    .from("invoice_items")
    .insert(items)
    .select();
  if (itemsError) throw new ValidationError(itemsError.message);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "invoices",
    entityId: invoice.id,
    description: `Invoice ${invoiceNumber} created for ${patient.first_name} ${patient.last_name}`,
  });

  return ok({ ...invoice, invoice_items: createdItems ?? [] }, 201);
});

export const runtime = "nodejs";
