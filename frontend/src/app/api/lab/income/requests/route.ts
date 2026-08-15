import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const REQUEST_SELECT =
  "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, external_lab_id, invoice_id, payment_id, referrer, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id, is_walk_in), users!lab_requests_doctor_id_fkey(id, full_name, role), lab_request_items(id, service_id, service_name, priority, sample_type, notes, result, result_unit, is_abnormal, reported_at), lab_request_assignments(user_id, users(id, full_name, role)), invoices!fk_lab_requests_invoice(id, invoice_number, status, total_amount), payments!fk_lab_requests_payment(id, reference, payment_method, amount, status, paid_at)";

// GET /api/lab/income/requests?serviceId=&serviceName=&from=&to=
// Drill-down behind the Lab Services Income page: the individual lab requests
// (testings) that make up one service's income row. Matches catalogue-linked
// items by service_id and free-text items by service_name (the same way the
// lab_income_report RPC attributes invoice lines), merged and deduped.
//
// NOTE: we resolve matching lab_request_items to their parent request ids
// FIRST, then fetch the requests — an embedded filter like
// `lab_request_items.service_id=eq.X` only narrows the CHILDREN, not the
// parent rows, so it must not be used here.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const sp = req.nextUrl.searchParams;
  const serviceId = sp.get("serviceId")?.trim() || null;
  const serviceName = sp.get("serviceName")?.trim() || null;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;

  if (!serviceId && !serviceName) {
    throw new ValidationError("serviceId or serviceName is required");
  }

  const itemQueries: any[] = [];
  if (serviceId) itemQueries.push(ctx.svc.from("lab_request_items").select("request_id").eq("service_id", serviceId).limit(1000));
  if (serviceName) itemQueries.push(ctx.svc.from("lab_request_items").select("request_id").ilike("service_name", `%${serviceName}%`).limit(1000));

  const itemResults = await Promise.all(itemQueries);
  const itemError = itemResults.find((r) => r.error)?.error;
  if (itemError) throw new ValidationError(itemError.message);

  const requestIds = Array.from(
    new Set(itemResults.flatMap((r) => r.data ?? []).map((x: { request_id: string }) => x.request_id).filter(Boolean))
  );
  if (requestIds.length === 0) return ok({ requests: [], count: 0 });

  const REQUEST_SELECT =
    "id, tenant_id, branch_id, patient_id, doctor_id, status, is_external, external_lab_id, invoice_id, payment_id, referrer, requested_at, completed_at, notes, created_by, created_at, updated_at, patients(id, patient_number, first_name, last_name, user_id, is_walk_in), users!lab_requests_doctor_id_fkey(id, full_name, role), lab_request_items(id, service_id, service_name, priority, sample_type, notes, result, result_unit, is_abnormal, reported_at), lab_request_assignments(user_id, users(id, full_name, role)), invoices!fk_lab_requests_invoice(id, invoice_number, status, total_amount), payments!fk_lab_requests_payment(id, reference, payment_method, amount, status, paid_at)";

  const requests: any[] = [];
  for (let i = 0; i < requestIds.length; i += 100) {
    let q = ctx.svc
      .from("lab_requests")
      .select(REQUEST_SELECT)
      .eq("tenant_id", tenantId)
      .in("id", requestIds.slice(i, i + 100))
      .order("requested_at", { ascending: false });
    if (from) q = q.gte("requested_at", from);
    if (to) q = q.lte("requested_at", `${to} 23:59:59`);
    const { data, error } = await q;
    if (error) throw new ValidationError(error.message);
    requests.push(...(data ?? []));
  }

  requests.sort((a, b) => String(b.requested_at ?? "").localeCompare(String(a.requested_at ?? "")));
  return ok({ requests, count: requests.length });
});

export const runtime = "nodejs";
