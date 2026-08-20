import { Loader2, X } from "lucide-react";
import { spinner } from "@/lib/ui-constants";
import type { Dispatch, SetStateAction } from "react";
import type { FormEvent } from "react";
import { inputCls, labelCls, type Shift, type StaffOpt } from "./hr-roster-shared";

export function AssignShiftModal(props: {
  setShowAssign: Dispatch<SetStateAction<boolean>>;
  staffId: string;
  setStaffId: Dispatch<SetStateAction<string>>;
  staff: StaffOpt[];
  shiftId: string;
  setShiftId: Dispatch<SetStateAction<string>>;
  shifts: Shift[];
  shiftDate: string;
  setShiftDate: Dispatch<SetStateAction<string>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  error: string | null;
  busy: boolean;
  assign: (e: FormEvent) => void;
}) {
  const { setShowAssign, staffId, setStaffId, staff, shiftId, setShiftId, shifts, shiftDate, setShiftDate, notes, setNotes, error, busy, assign } = props;
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAssign(false)}>
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={assign}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">Assign shift</h3>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setShowAssign(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Staff member</label>
                <select className={inputCls + " w-full"} value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
                  <option value="">Select staff…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.users?.full_name} · {s.users?.role}{s.users?.is_active === false ? " (disabled)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Shift</label>
                <select className={inputCls + " w-full"} value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
                  <option value="">Select shift…</option>
                  {shifts.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}{s.department ? ` · ${s.department}` : ""}{s.ward?.name ? ` · ${s.ward.name}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Date</label>
                <input type="date" className={inputCls + " w-full"} value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input className={inputCls + " w-full"} placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className={spinner} />} Assign
              </button>
            </div>
          </form>
        </div>
  );
}
