import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify Prescription — SkyCare",
  description: "Public prescription verification. Scan the QR code on a SkyCare prescription to verify its authenticity.",
  robots: { index: false },
};

interface VerifyRow {
  prescription_id: string;
  status: string;
  pharmacy_type: string;
  patient_name: string | null;
  doctor_name: string | null;
  issued_at: string | null;
  dispensed_at: string | null;
  drugs: Array<{ name: string | null; dosage: string | null; frequency: string | null; route: string | null; duration: string | null }> | null;
}

function fmtDate(iso: string | null, withTimeLabel?: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function VerifyPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const svc = createServiceClient();

  let row: VerifyRow | null = null;
  let errorMessage: string | null = null;
  try {
    const { data, error } = await svc.rpc("prescription_verify_snapshot", { p_prescription_id: id });
    if (error) throw new Error(error.message);
    if (data && data.length > 0) row = data[0];
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Verification failed";
  }

  const statusMap: Record<string, { label: string; tone: string }> = {
    pending: { label: "Pending processing", tone: "bg-amber-100 text-amber-800 border-amber-200" },
    processing: { label: "Being processed", tone: "bg-sky-100 text-sky-800 border-sky-200" },
    partial: { label: "Partially dispensed", tone: "bg-violet-100 text-violet-800 border-violet-200" },
    dispensed: { label: "Dispensed", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    completed: { label: "Completed", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    cancelled: { label: "Cancelled", tone: "bg-rose-100 text-rose-800 border-rose-200" },
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold ${row ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
            {row ? "✓" : "✕"}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {row ? "Prescription Verified" : errorMessage ? "Verification Unavailable" : "Prescription Not Found"}
            </h1>
            <p className="text-sm text-slate-500">
              {row
                ? "This prescription was issued on the SkyCare HMS with the details below."
                : "The QR code does not match a valid SkyCare prescription."}
            </p>
          </div>
        </div>

        {row && (
          <>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${statusMap[row.status]?.tone ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
              {statusMap[row.status]?.label ?? row.status.replace(/_/g, " ")}
            </div>

            <dl className="mt-5 space-y-4">
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Patient</dt>
                <dd className="text-sm font-semibold text-slate-900">{row.patient_name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Prescribing doctor</dt>
                <dd className="text-sm font-semibold text-slate-900">{row.doctor_name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Fulfilment</dt>
                <dd className="text-sm font-semibold text-slate-900">
                  {row.pharmacy_type === "external" ? "External pharmacy" : "In-house pharmacy"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Issued</dt>
                <dd className="text-sm font-semibold text-slate-900">{fmtDate(row.issued_at)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="text-sm text-slate-500">Dispensed</dt>
                <dd className="text-sm font-semibold text-slate-900">{fmtDate(row.dispensed_at)}</dd>
              </div>
            </dl>

            <div className="mt-5">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Medications</h2>
              <ul className="space-y-2">
                {(row.drugs ?? []).map((d, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-900">{d.name || "Medication"}</p>
                    <p className="text-xs text-slate-500">
                      {[d.dosage, d.frequency, d.route, d.duration].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </li>
                ))}
                {(row.drugs ?? []).length === 0 && (
                  <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">No medications recorded.</li>
                )}
              </ul>
            </div>
          </>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          SkyCare HMS · Prescription ID {id.slice(0, 8)}…
        </p>
      </div>
    </main>
  );
}