import { withStaff, ok, ValidationError, NotFoundError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyInvoiceIssued } from "@/lib/notify";
import { getTenantSettings, generateInvoiceNumber } from "@/lib/tenant-settings";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/lab-requests/[id]/invoice — generate an invoice from a lab
// request (billable at request time or any later stage). One invoice per
// request (lab_requests.invoice_id), priced from the lab_services catalogue.
// Services without a catalogue price bill at 0. A pending invoice is the
// patient's "credit" — it shows in their portal as an outstanding payment.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "billing", "full");

  const routeSegments = req.nextUrl.pathname.split("/");
  const requestId = routeSegments[routeSegments.length - 2];

  const { data: labRequest, error: reqError } = await ctx.svc
    .from("lab_requests")
    .select(
      "id, tenant_id, branch_id, patient_id, doctor_id, status, invoice_id, payment_id, notes, created_at, patients(id, patient_number, first_name, last_name), lab_request_items(id, service_id, service_name)"
    )
    .eq("id", requestId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (reqError || !labRequest) throw new NotFoundError("Lab request not found");
  if (labRequest.status === "cancelled") {
    throw new ValidationError("Cancelled lab requests cannot be billed");
  }
  if (labRequest.payment_id) {
    throw new ValidationError("Walk-in requests are paid up-front and do not get an invoice");
  }
  if (labRequest.invoice_id) {
    const { data: existing } = await ctx.svc
      .from("invoices")
      .select("invoice_number")
      .eq("id", labRequest.invoice_id)
      .maybeSingle();
    throw new ValidationError(
      `Invoice already generated for this request (${existing?.invoice_number ?? labRequest.invoice_id})`
    );
  }

  const items = labRequest.lab_request_items ?? [];
  const patient = (labRequest.patients as unknown as
    | { id: string; patient_number: string; first_name: string; last_name: string }
    | null) ?? null;
  const serviceIds = items
    .map((it: { service_id: string | null }) => it.service_id)
    .filter((id: string | null): id is string => Boolean(id));

  // Catalogue prices (tenant-scoped), keyed by service id.
  const priceById = new Map<string, number>();
  if (serviceIds.length > 0) {
    const { data: services } = await ctx.svc
      .from("lab_services")
      .select("id, price")
      .eq("tenant_id", tenantId)
      .in("id", serviceIds);
    for (const s of services ?? []) priceById.set(s.id, s.price);
  }

  const subtotal = items.reduce(
    (sum: number, it: { service_id: string | null }) => sum + (priceById.get(it.service_id ?? "") ?? 0),
    0
  );

  const settings = await getTenantSettings(ctx.svc, tenantId);
  const invoiceNumber = await generateInvoiceNumber(ctx.svc, tenantId, settings.invoicePrefix);

  const { data: invoice, error: invoiceError } = await ctx.svc
    .from("invoices")
    .insert({
      tenant_id: tenantId,
      branch_id: labRequest.branch_id ?? null,
      patient_id: labRequest.patient_id,
      invoice_number: invoiceNumber,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: null,
      status: "pending",
      subtotal,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: subtotal,
      paid_amount: 0,
      insurance_claimable: false,
      notes: labRequest.notes ?? `Lab services from request (${new Date(labRequest.created_at).toLocaleDateString()})`,
      created_by: ctx.user.id,
      attending_staff_id: labRequest.doctor_id ?? null,
    })
    .select()
    .single();
  if (invoiceError) throw new ValidationError(invoiceError.message);

  const invoiceItems = items.map((it: { service_id: string | null; service_name: string }) => {
    const price = priceById.get(it.service_id ?? "") ?? 0;
    return {
      invoice_id: invoice.id,
      description: it.service_name,
      quantity: 1,
      unit_price: price,
      total_price: price,
      vat_percent: 0,
      vat_amount: 0,
    };
  });
  const { error: itemsError } = await ctx.svc.from("invoice_items").insert(invoiceItems);
  if (itemsError) throw new ValidationError(itemsError.message);

  const { error: linkError } = await ctx.svc
    .from("lab_requests")
    .update({ invoice_id: invoice.id })
    .eq("id", requestId)
    .eq("tenant_id", tenantId);
  if (linkError) throw new ValidationError(linkError.message);

  await notifyInvoiceIssued(ctx.svc, tenantId, labRequest.patient_id, invoice.id, invoiceNumber, subtotal);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "invoices",
    entityId: invoice.id,
    description: `Invoice ${invoiceNumber} generated from lab request for ${patient?.first_name ?? "patient"} ${patient?.last_name ?? ""} (${items.length} service(s))`,
  });

  return ok({ ...invoice, invoice_items: invoiceItems }, 201);
});

export const runtime = "nodejs";