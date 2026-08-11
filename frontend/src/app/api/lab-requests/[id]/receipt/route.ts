import { withStaff, ok, NotFoundError, ValidationError, requireTenant, requireModuleLevel } from "@/lib/api-utils";
import { logView } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/lab-requests/[id]/receipt — payment-receipt data bundle for a
// walk-in / external-customer lab request (no invoice is raised for these;
// the payment itself is the proof). Staff-facing, printable via the receipt page.
export const GET = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  await requireModuleLevel(ctx, "lab", "full");

  const routeSegments = req.nextUrl.pathname.split("/");
  const id = routeSegments[routeSegments.length - 2];

  const { data: labRequest, error: reqError } = await ctx.svc
    .from("lab_requests")
    .select(
      "id, tenant_id, branch_id, patient_id, status, referrer, payment_id, requested_at, notes, patients(id, patient_number, first_name, last_name, phone, email, is_walk_in), payments!fk_lab_requests_payment(id, reference, amount, payment_method, status, paid_at, gateway), lab_request_items(id, service_id, service_name)"
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (reqError || !labRequest) throw new NotFoundError("Lab request not found");
  if (!labRequest.payment_id) {
    throw new ValidationError("This request has no up-front payment receipt");
  }

  // Prices from the catalogue (same rule as invoicing / walk-in payment).
  const serviceIds = (labRequest.lab_request_items ?? [])
    .map((it: { service_id: string | null }) => it.service_id)
    .filter((sid: string | null): sid is string => Boolean(sid));
  const priceById = new Map<string, number>();
  if (serviceIds.length > 0) {
    const { data: services } = await ctx.svc
      .from("lab_services")
      .select("id, price")
      .eq("tenant_id", tenantId)
      .in("id", serviceIds);
    for (const s of services ?? []) priceById.set(s.id, s.price);
  }

  const { data: tenant } = await ctx.svc
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  const items = (labRequest.lab_request_items ?? []).map(
    (it: { service_id: string | null; service_name: string }) => ({
      service_name: it.service_name,
      price: priceById.get(it.service_id ?? "") ?? 0,
    })
  );

  // PostgREST embeds can arrive as object (to-one) or array (to-many); the
  // hinted FK joins here are to-one but supabase-js types them as arrays.
  const asRow = <T>(v: unknown): T | null => {
    if (Array.isArray(v)) return (v.length > 0 ? (v[0] as T) : null);
    if (v && typeof v === "object") return v as T;
    return null;
  };

  const patient = asRow<{
    id: string;
    patient_number: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    is_walk_in: boolean | null;
  }>(labRequest.patients);

  const payment = asRow<{
    id: string;
    reference: string | null;
    amount: number;
    payment_method: string | null;
    status: string;
    paid_at: string | null;
    gateway: string | null;
  }>(labRequest.payments);

  await logView(req, ctx, "lab_requests", labRequest.id, "Viewed walk-in payment receipt");

  return ok({
    tenant_name: tenant?.name ?? "SkyCare HMS",
    request: {
      id: labRequest.id,
      requested_at: labRequest.requested_at,
      status: labRequest.status,
      referrer: labRequest.referrer ?? null,
      notes: labRequest.notes ?? null,
    },
    patient,
    payment,
    items,
    total: items.reduce((sum: number, it: { price: number }) => sum + it.price, 0),
  });
});

export const runtime = "nodejs";
