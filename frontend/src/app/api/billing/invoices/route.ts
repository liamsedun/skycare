import { withAuth, okPaginated, ForbiddenError, ValidationError, requireTenant, getPagination, resolveParam, sanitizeLike, applyBranchFilter } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BILLING_ROLES = ["hospital_admin", "cashier"];

const CENTRAL_SELECT =
  "id, tenant_id, branch_id, patient_id, admission_id, invoice_number, issue_date, due_date, status, subtotal, tax_amount, discount_amount, total_amount, paid_amount, insurance_claimable, notes, created_by, attending_staff_id, created_at, updated_at, patients(id, patient_number, first_name, last_name, gender, phone, user_id), invoice_items(id, description, quantity, unit_price, total_price, vat_percent, vat_amount), payments(id, amount, payment_method, status, reference, paid_at)";

const PHX_SELECT =
  "id, invoice_number, source, branch_id, patient_id, visit_id, prescription_id, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status, insurance_claimable, notes, synced_invoice_id, created_by, created_at, paid_at, patients(id, patient_number, first_name, last_name, phone), pharmacy_invoice_items(id, drug_id, drug_name, quantity, unit_price, total_price, is_covered, co_pay_amount), pharmacy_payments(id, amount, method, reference, status, received_at)";

// Map a pharmacy status into the central vocabulary so one filter chip set
// can drive both ledgers (the billing page is the single income view).
function mapPharmacyStatus(status: string): string {
  if (status === "unpaid") return "pending";
  if (status === "partial") return "partially_paid";
  return status;
}

// Central pharmacy statuses that belong to a central-vocabulary filter chip.
function pharmacyStatusesFor(filter: string): string[] | null {
  switch (filter) {
    case "pending": return ["unpaid"];
    case "partially_paid": return ["partial"];
    case "paid": return ["paid"];
    case "cancelled": return ["cancelled"];
    case "refunded": return ["refunded"];
    default: return null;
  }
}

// GET /api/billing/invoices?q=&from=&to=&status=&source=&page=&pageSize=
// The unified billing stream: central invoices (medical services, lab bills,
// ward room charges, mirrored pharmacy sales) PLUS pharmacy sales that were
// never mirrored (walk-in counter sales with no patient). Every row is
// source-tagged so the Billing page can show and filter by where the income
// came from.
export const GET = withAuth(async (req, ctx) => {
  if (!BILLING_ROLES.includes(ctx.role)) {
    throw new ForbiddenError("You do not have permission to view billing");
  }
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from: rangeFrom, to: rangeTo } = getPagination(req.nextUrl.searchParams);
  const q = resolveParam(req.nextUrl.searchParams.get("q"))?.trim() ?? null;
  const from = resolveParam(req.nextUrl.searchParams.get("from"))?.trim() || null;
  const to = resolveParam(req.nextUrl.searchParams.get("to"))?.trim() || null;
  const status = resolveParam(req.nextUrl.searchParams.get("status")) || null;
  const source = resolveParam(req.nextUrl.searchParams.get("source")) || null;
  if (from && to && from > to) throw new ValidationError("from must be on or before to");

  // Source sets for central rows: ward = invoices.admission_id, lab = linked
  // lab_requests, pharmacy = mirrored pharmacy invoices, else medical.
  const [labRes, phxRes] = await Promise.all([
    ctx.svc.from("lab_requests").select("invoice_id").not("invoice_id", "is", null),
    ctx.svc.from("pharmacy_invoices").select("synced_invoice_id").not("synced_invoice_id", "is", null),
  ]);
  if (labRes.error || phxRes.error) throw new ValidationError(labRes.error?.message ?? phxRes.error?.message ?? "Failed to load billing sources");
  const labIds = new Set((labRes.data ?? []).map((r) => r.invoice_id));
  const phxMirroredIds = new Set((phxRes.data ?? []).map((r) => r.synced_invoice_id));

  // Free-text search: invoice number OR patient number/name OR line
  // description/drug name (children are pre-resolved, then parents fetched —
  // an embedded filter would only narrow the child rows).
  let patientIds: string[] | null = null;
  let centralItemInvIds: string[] | null = null;
  let phxItemInvIds: string[] | null = null;
  if (q) {
    const like = `%${sanitizeLike(q)}%`;
    const [patRes, citRes, pitRes] = await Promise.all([
      ctx.svc
        .from("patients")
        .select("id")
        .eq("tenant_id", tenantId)
        .or(`first_name.ilike.${like},last_name.ilike.${like},patient_number.ilike.${like}`),
      ctx.svc.from("invoice_items").select("invoice_id").ilike("description", like).limit(800),
      ctx.svc.from("pharmacy_invoice_items").select("invoice_id").ilike("drug_name", like).limit(800),
    ]);
    if (patRes.error || citRes.error || pitRes.error) throw new ValidationError("Failed to search invoices");
    patientIds = (patRes.data ?? []).map((r) => r.id);
    centralItemInvIds = (citRes.data ?? []).map((r) => r.invoice_id);
    phxItemInvIds = (pitRes.data ?? []).map((r) => r.invoice_id);
  }

  // ---- 1. Central invoices ----
  let cq = ctx.svc
    .from("invoices")
    .select(CENTRAL_SELECT, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  cq = applyBranchFilter(cq, req.nextUrl.searchParams, ctx);
  if (status) cq = cq.eq("status", status);
  if (from) cq = cq.gte("issue_date", from);
  if (to) cq = cq.lte("issue_date", to);
  if (q) {
    const ors = [`invoice_number.ilike.%${sanitizeLike(q)}%`];
    if (patientIds && patientIds.length > 0) ors.push(`patient_id.in.(${patientIds.join(",")})`);
    if (centralItemInvIds && centralItemInvIds.length > 0) ors.push(`id.in.(${centralItemInvIds.join(",")})`);
    cq = cq.or(ors.join(","));
  }
  const centralRes = await cq;
  if (centralRes.error) throw new ValidationError(centralRes.error.message);

  // ---- 2. Un-mirrored pharmacy sales (walk-ins and anything that skipped
  // the central mirror) — never shown twice because mirrored ones are already
  // in the central stream as their own rows. ----
  let pq = ctx.svc
    .from("pharmacy_invoices")
    .select(PHX_SELECT)
    .eq("tenant_id", tenantId)
    .is("synced_invoice_id", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  pq = applyBranchFilter(pq, req.nextUrl.searchParams, ctx);
  if (status) {
    const matches = pharmacyStatusesFor(status);
    if (matches) pq = pq.in("status", matches);
    else pq = pq.eq("status", status); // unpaid/partial/other vocabulary still works
  }
  if (from) pq = pq.gte("created_at", `${from}T00:00:00`);
  if (to) pq = pq.lte("created_at", `${to}T23:59:59.999`);
  if (q) {
    const ors = [`invoice_number.ilike.%${sanitizeLike(q)}%`];
    if (patientIds && patientIds.length > 0) ors.push(`patient_id.in.(${patientIds.join(",")})`);
    if (phxItemInvIds && phxItemInvIds.length > 0) ors.push(`id.in.(${phxItemInvIds.join(",")})`);
    pq = pq.or(ors.join(","));
  }
  const phxRes2 = await pq;
  if (phxRes2.error) throw new ValidationError(phxRes2.error.message);

  const sourceOf = (row: { id: string; admission_id: string | null }): string => {
    if (row.admission_id) return "ward";
    if (labIds.has(row.id)) return "lab";
    if (phxMirroredIds.has(row.id)) return "pharmacy";
    return "medical";
  };

  const centralRows = (centralRes.data ?? []).map((row) => ({
    ...row,
    kind: "central",
    source: sourceOf(row),
  }));

  const phxRows = (phxRes2.data ?? []).map((row) => ({
    ...row,
    kind: "pharmacy",
    source: "pharmacy",
    issue_date: row.created_at ? row.created_at.slice(0, 10) : "",
    due_date: null,
    status: mapPharmacyStatus(row.status),
    invoice_items: row.pharmacy_invoice_items ?? [],
    payments: (row.pharmacy_payments ?? []).map((p: { id: string; amount: number; method: string; status: string; reference: string | null; received_at: string | null }) => ({
      id: p.id,
      amount: p.amount,
      payment_method: p.method,
      status: p.status === "completed" ? "completed" : "pending",
      reference: p.reference,
      paid_at: p.received_at,
    })),
  }));

  const merged = [...centralRows, ...phxRows]
    .filter((r) => !source || r.source === source)
    .sort((a, b) => {
      const d = String(b.issue_date ?? "").localeCompare(String(a.issue_date ?? ""));
      if (d !== 0) return d;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });

  const total = merged.length;
  const slice = merged.slice(rangeFrom, rangeTo + 1);

  return okPaginated(slice, total, page, pageSize);
});

export const runtime = "nodejs";