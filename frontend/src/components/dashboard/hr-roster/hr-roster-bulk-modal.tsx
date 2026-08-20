import { Loader2, X } from "lucide-react";
import { divideBorder, mutedXs, mutedXsMt, spinner } from "@/lib/ui-constants";
import type { Dispatch, SetStateAction } from "react";
import type { FormEvent } from "react";
import { inputCls, labelCls, type Shift, type StaffOpt } from "./hr-roster-shared";

export function BulkAssignModal(props: {
  setShowBulk: Dispatch<SetStateAction<boolean>>;
  setBulkMsg: Dispatch<SetStateAction<{ kind: 'ok' | 'err'; text: string } | null>>;
  bulkShiftId: string;
  setBulkShiftId: Dispatch<SetStateAction<string>>;
  shifts: Shift[];
  bulkFrom: string;
  setBulkFrom: Dispatch<SetStateAction<string>>;
  bulkTo: string;
  setBulkTo: Dispatch<SetStateAction<string>>;
  bulkNotes: string;
  setBulkNotes: Dispatch<SetStateAction<string>>;
  bulkDept: string;
  setBulkDept: Dispatch<SetStateAction<string>>;
  bulkRole: string;
  setBulkRole: Dispatch<SetStateAction<string>>;
  bulkStaffIds: string[];
  setBulkStaffIds: Dispatch<SetStateAction<string[]>>;
  bulkMsg: { kind: 'ok' | 'err'; text: string } | null;
  busy: boolean;
  bulkAssign: (e: FormEvent) => void;
  staff: StaffOpt[];
}) {
  const { setShowBulk, setBulkMsg, bulkShiftId, setBulkShiftId, shifts, bulkFrom, setBulkFrom, bulkTo, setBulkTo, bulkNotes, setBulkNotes, bulkDept, setBulkDept, bulkRole, setBulkRole, bulkStaffIds, setBulkStaffIds, bulkMsg, busy, bulkAssign, staff } = props;
  const bulkCandidates = staff.filter((s) => s.users?.is_active !== false).filter((s) => !bulkDept || s.department === bulkDept).filter((s) => !bulkRole || s.users?.role === bulkRole);
  const bulkDeptOptions = [...new Set(staff.map((s) => s.department).filter(Boolean))].sort() as string[];
  const bulkRoleOptions = [...new Set(staff.map((s) => s.users?.role).filter(Boolean))].sort() as string[];
  const bulkDays = !bulkFrom || !bulkTo || bulkTo < bulkFrom ? 0 : Math.floor((Date.parse(bulkTo) - Date.parse(bulkFrom)) / 86400000) + 1;
  const toggleStaff = (id: string) =>
    setBulkStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAllCandidates = () =>
    setBulkStaffIds((prev) => [...new Set([...prev, ...bulkCandidates.map((s) => s.id)])]);
  const clearCandidates = () =>
    setBulkStaffIds((prev) => prev.filter((id) => !bulkCandidates.some((s) => s.id === id)));
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBulk(false)}>
          <form className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={bulkAssign}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Bulk assign shifts</h3>
                <p className={mutedXsMt}>Assign one shift template to many staff across a date range.</p>
              </div>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => { setShowBulk(false); setBulkMsg(null); }}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Shift</label>
                  <select className={inputCls + " w-full"} value={bulkShiftId} onChange={(e) => setBulkShiftId(e.target.value)} required>
                    <option value="">Select shift…</option>
                    {shifts.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} · {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}{s.department ? ` · ${s.department}` : ""}{s.ward?.name ? ` · ${s.ward.name}` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>From</label>
                  <input type="date" className={inputCls + " w-full"} value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>To</label>
                  <input type="date" className={inputCls + " w-full"} value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input className={inputCls + " w-full"} placeholder="Optional — applied to every assigned shift" value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} />
              </div>
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-foreground)]">Staff</span>
                  <select className={inputCls + " max-w-[220px]"} value={bulkDept} onChange={(e) => setBulkDept(e.target.value)} aria-label="Narrow by department">
                    <option value="">All departments</option>
                    {bulkDeptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select className={inputCls + " max-w-[220px]"} value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} aria-label="Narrow by role">
                    <option value="">All roles</option>
                    {bulkRoleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={selectAllCandidates}>Select all {bulkCandidates.length}</button>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={clearCandidates}>Clear</button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--color-border)]">
                  {bulkCandidates.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-fg)]">No active staff match these filters.</div>
                  ) : (
                    <div className={divideBorder}>
                      {bulkCandidates.map((s) => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--color-muted)]">
                          <input type="checkbox" className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" checked={bulkStaffIds.includes(s.id)} onChange={() => toggleStaff(s.id)} />
                          <span className="font-medium">{s.users?.full_name}</span>
                          <span className={mutedXs}>{s.users?.role}{s.department ? ` · ${s.department}` : ""}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-800">
                {bulkStaffIds.length} staff × {bulkDays} day{bulkDays === 1 ? "" : "s"} = {bulkStaffIds.length * bulkDays} shift{bulkStaffIds.length * bulkDays === 1 ? "" : "s"}
              </div>
              {bulkMsg?.kind === "ok" && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{bulkMsg.text}</div>}
              {bulkMsg?.kind === "err" && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{bulkMsg.text}</div>}
              <button type="submit" disabled={busy || bulkStaffIds.length === 0 || !bulkShiftId || !bulkFrom || !bulkTo} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className={spinner} />} Assign {bulkStaffIds.length * bulkDays} shift{bulkStaffIds.length * bulkDays === 1 ? "" : "s"}
              </button>
            </div>
          </form>
        </div>
  );
}
