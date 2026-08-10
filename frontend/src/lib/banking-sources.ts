import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Classify main-ledger payment rows into Lab income / Ward income / general
 * patient payment, mirroring the lab_income_report attribution (invoice items
 * whose description matches a lab_services name) and the ward billing flow
 * (0057 marks ward invoices with admission_id).
 *
 * Returns a Map of payment_id → "lab" | "ward" | "payment". Rows without a
 * payment_id (adjustments, income, expenses) are left untouched by callers.
 */
export async function classifyLedgerSources(
  svc: SupabaseClient,
  tenantId: string,
  rows: Array<{ payment_id: string | null }>
): Promise<Map<string, "lab" | "ward" | "payment">> {
  const result = new Map<string, "lab" | "ward" | "payment">();
  const paymentIds = [...new Set(rows.map((r) => r.payment_id).filter(Boolean) as string[])];
  if (paymentIds.length === 0) return result;

  const [paymentsRes, labRes] = await Promise.all([
    svc.from("payments").select("id, invoice_id").in("id", paymentIds),
    svc.from("lab_services").select("name").eq("tenant_id", tenantId),
  ]);
  if (paymentsRes.error || !paymentsRes.data) return result;

  const labNames = ((labRes.data ?? []) as Array<{ name: string }>)
    .map((l) => l.name?.trim().toLowerCase())
    .filter(Boolean) as string[];

  const paymentByInvoice = new Map<string | null, string>();
  for (const p of paymentsRes.data as Array<{ id: string; invoice_id: string | null }>) {
    paymentByInvoice.set(p.invoice_id, p.id);
  }
  const invoiceIds = [...new Set((paymentsRes.data as Array<{ invoice_id: string | null }>).map((p) => p.invoice_id).filter(Boolean))] as string[];
  if (invoiceIds.length === 0) return result;

  const [invoicesRes, itemsRes] = await Promise.all([
    svc.from("invoices").select("id, admission_id").in("id", invoiceIds),
    svc.from("invoice_items").select("invoice_id, description").in("invoice_id", invoiceIds),
  ]);

  const wardInvoiceIds = new Set(
    ((invoicesRes.data ?? []) as Array<{ id: string; admission_id: string | null }>)
      .filter((i) => i.admission_id != null)
      .map((i) => i.id)
  );
  const labInvoiceIds = new Set<string>();
  if (labNames.length > 0) {
    for (const item of (itemsRes.data ?? []) as Array<{ invoice_id: string; description: string | null }>) {
      if (wardInvoiceIds.has(item.invoice_id)) continue;
      const desc = (item.description ?? "").toLowerCase();
      if (labNames.some((n) => desc.includes(n))) labInvoiceIds.add(item.invoice_id);
    }
  }

  for (const [invoiceId, paymentId] of paymentByInvoice) {
    if (wardInvoiceIds.has(invoiceId!)) result.set(paymentId, "ward");
    else if (labInvoiceIds.has(invoiceId!)) result.set(paymentId, "lab");
    else result.set(paymentId, "payment");
  }
  return result;
}
