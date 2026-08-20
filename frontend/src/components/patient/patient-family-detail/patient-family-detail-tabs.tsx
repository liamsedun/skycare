import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Stethoscope,
} from "lucide-react";
import { AppEmpty, cn } from "@/components/patient/mobile/mobile-app-ui";
import { cardTitle, fgSemibold, mutedXs, mutedXsMt1 } from "@/lib/ui-constants";
import { fmtDate, ngn } from "@/lib/patient-family-shared";
import {
  type AppointmentRow,
  type DoctorNote,
  type InvoiceRow,
  type MedicalRecord,
  type MedicalReport,
  recordTypeLabels,
} from "./patient-family-detail-shared";

export function RecordsTab({
  records,
  notes,
  reports,
  mobile,
}: {
  records: MedicalRecord[];
  notes: DoctorNote[];
  reports: MedicalReport[];
  mobile?: boolean;
}) {
  const card = mobile ? "app-glass rounded-2xl p-4" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]";
  if (records.length === 0 && notes.length === 0 && reports.length === 0) {
    return (
      <AppEmpty
        icon={ClipboardList}
        title="No records yet"
        hint="Medical records, doctor notes and reports will appear here."
      />
    );
  }
  return (
    <div className="space-y-4">
      {records.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Clinical records · {records.length}</p>
          <div className="space-y-2">
            {records.map((rec) => (
              <details key={rec.id} className="group rounded-xl border border-[var(--color-border)] bg-black/[0.02]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-[var(--color-foreground)]">
                  <span className="rounded-full bg-[#e0a84a]/15 px-2 py-0.5 text-[10px] font-bold text-[#e0a84a]">
                    {recordTypeLabels[rec.record_type] ?? rec.record_type.replace(/_/g, " ")}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{rec.title ?? fmtDate(rec.created_at)}</span>
                  <span className="text-[10px] font-normal text-[var(--color-muted-fg)]">{fmtDate(rec.created_at)}</span>
                </summary>
                <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                  {rec.users?.full_name && (
                    <p className="mb-1 text-[11px] font-medium text-[var(--color-primary-dark)]">
                      {rec.users.full_name} · {rec.users.role}
                    </p>
                  )}
                  {rec.content ? (
                    <p className="whitespace-pre-wrap text-xs text-[var(--color-foreground)]">{rec.content}</p>
                  ) : (
                    <p className={mutedXs}>No details.</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Doctor notes · {notes.length}</p>
          <div className="space-y-2">
            {notes.map((note) => {
              const diagnosis = (note.diagnosis ?? {}) as Record<string, unknown>;
              return (
                <details key={note.id} className="group rounded-xl border border-[var(--color-border)] bg-black/[0.02]">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-[var(--color-foreground)]">
                    <Stethoscope size={13} className="text-[var(--color-primary)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {fmtDate(note.visit_date ?? note.created_at)}
                      {note.users?.full_name ? ` — ${note.users.full_name}` : ""}
                    </span>
                  </summary>
                  <div className="space-y-1.5 border-t border-[var(--color-border)] px-3 py-2.5 text-xs">
                    {note.clinical_findings && (
                      <p className="text-[var(--color-foreground)]"><span className="font-semibold">Findings: </span>{note.clinical_findings}</p>
                    )}
                    {Object.keys(diagnosis).length > 0 && (
                      <p className="text-[var(--color-foreground)]">
                        <span className="font-semibold">Diagnosis: </span>
                        {String(diagnosis.primary ?? "")}
                        {(Array.isArray(diagnosis.secondary) ? diagnosis.secondary : []).map((d) => String(d)).filter(Boolean).join(", ")}
                      </p>
                    )}
                    {note.treatment_recommendations && (
                      <p className="text-[var(--color-foreground)]"><span className="font-semibold">Treatment: </span>{note.treatment_recommendations}</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {reports.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Medical reports · {reports.length}</p>
          <div className="space-y-2">
            {reports.map((rep) => (
              <details key={rep.id} className="group rounded-xl border border-[var(--color-border)] bg-black/[0.02]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs font-medium text-[var(--color-foreground)]">
                  <ClipboardList size={13} className="text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {rep.reference_number ?? "Report"} · {fmtDate(rep.report_date ?? rep.created_at)}
                  </span>
                </summary>
                <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                  {rep.author_name && (
                    <p className="mb-1 text-[11px] font-medium text-[var(--color-primary-dark)]">
                      {rep.author_name}{rep.author_title ? ` · ${rep.author_title}` : ""}
                    </p>
                  )}
                  {rep.content && (
                    <p className="whitespace-pre-wrap text-xs text-[var(--color-foreground)]">{rep.content}</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BillsTab({
  invoices,
  outstanding,
  onPay,
  mobile,
}: {
  invoices: InvoiceRow[];
  outstanding: number;
  onPay: (inv: InvoiceRow) => void;
  mobile?: boolean;
}) {
  if (invoices.length === 0) {
    return (
      <AppEmpty
        icon={Banknote}
        title="No bills yet"
        hint="Invoices issued for this family member will appear here."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className={cn("flex items-center justify-between", mobile ? "app-glass rounded-2xl px-4 py-3" : "rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)]")}>
        <span className="text-sm font-medium text-[var(--color-foreground)]">Total outstanding</span>
        <span className={cn("text-base font-bold", outstanding > 0 ? "text-rose-500" : "text-emerald-500")}>{ngn(outstanding)}</span>
      </div>
      {invoices.map((inv) => {
        const due = Number(inv.due_date ? new Date(inv.due_date).getTime() : 0);
        const overdue = inv.status === "pending" && due > 0 && due < Date.now();
        const open = inv.status === "pending" || inv.status === "partially_paid";
        return (
          <div key={inv.id} className={cn(mobile ? "app-glass rounded-2xl p-4" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]")}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-sm font-bold text-[var(--color-foreground)]">{inv.invoice_number}</p>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", overdue ? "border-rose-500/20 bg-rose-100 text-rose-700" : inv.status === "paid" ? "border-emerald-500/20 bg-emerald-100 text-emerald-700" : "border-amber-500/20 bg-amber-100 text-amber-700")}>
                {overdue ? "Overdue" : inv.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className={mutedXsMt1}>
              Issued {fmtDate(inv.issue_date ?? inv.created_at)} · {inv.invoice_items.length} item{inv.invoice_items.length === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div className={mutedXs}>
                <p>Total <span className={fgSemibold}>{ngn(inv.total_amount)}</span></p>
                {Number(inv.paid_amount) > 0 && (
                  <p>Paid <span className="font-semibold text-emerald-500">{ngn(inv.paid_amount)}</span></p>
                )}
              </div>
              <div className="text-right">
                {open && Number(inv.total_amount) - Number(inv.paid_amount) > 0 && (
                  <button
                    type="button"
                    onClick={() => onPay(inv)}
                    className="focus-ring rounded-lg bg-gradient-to-br from-[#e0a84a] to-amber-500 px-3.5 py-2 text-xs font-semibold text-[#0a0f1a] shadow transition-transform hover:scale-[1.02]"
                  >
                    Pay {ngn(Number(inv.total_amount) - Number(inv.paid_amount))}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AppointmentsTab({
  appointments,
  mobile,
}: {
  appointments: AppointmentRow[];
  mobile?: boolean;
}) {
  if (appointments.length === 0) {
    return (
      <div className="space-y-3">
        <AppEmpty
          icon={CalendarDays}
          title="No appointments yet"
          hint="Book an appointment from the Appointments page."
        />
        <Link
          href="/patient/appointments"
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e0a84a]/40 py-3.5 text-sm font-semibold text-[#e0a84a] transition-colors hover:border-[#e0a84a]"
        >
          <CalendarPlus size={16} aria-hidden="true" /> Book Appointment
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Link
        href="/patient/appointments"
        className="focus-ring flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#e0a84a]/40 py-3.5 text-sm font-semibold text-[#e0a84a] transition-colors hover:border-[#e0a84a]"
      >
        <CalendarPlus size={16} aria-hidden="true" /> Book Appointment
      </Link>
      {appointments.map((appt) => (
        <div key={appt.id} className={cn(mobile ? "app-glass rounded-2xl p-4" : "rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]")}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cardTitle}>
                {fmtDate(appt.scheduled_date)} · {appt.start_time ?? "—"}
              </p>
              <p className="mt-0.5 text-xs capitalize text-[var(--color-muted-fg)]">{appt.type} — {appt.users?.full_name ?? "Staff"}</p>
              {appt.reason && <p className="mt-1 truncate text-xs text-[var(--color-muted-fg)]">{appt.reason}</p>}
            </div>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", appt.status === "completed" ? "border-emerald-500/20 bg-emerald-100 text-emerald-700" : appt.status === "cancelled" ? "border-rose-500/20 bg-rose-100 text-rose-700" : "border-amber-500/20 bg-amber-100 text-amber-700")}>
              {appt.status.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
