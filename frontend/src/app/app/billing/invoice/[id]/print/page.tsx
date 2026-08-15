import { Suspense } from "react";
import InvoicePrintView from "@/components/dashboard/invoice-print-view";

// Printable invoice page (staff): print or "Save as PDF" from the browser
// print dialog. Works for central invoices and pharmacy sales (?kind=pharmacy).
export default function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-[var(--color-muted-fg)]">Loading invoice…</p>}>
      <InvoicePrintView params={params} />
    </Suspense>
  );
}