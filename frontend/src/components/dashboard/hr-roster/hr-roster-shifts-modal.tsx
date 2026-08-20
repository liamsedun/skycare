import { Trash2, X } from "lucide-react";
import { flexGap2 } from "@/lib/ui-constants";
import type { Dispatch, SetStateAction } from "react";
import type { Shift } from "./hr-roster-shared";

export function ShiftTemplatesModal(props: {
  setShowShifts: Dispatch<SetStateAction<boolean>>;
  shifts: Shift[];
  openEditShift: (s: Shift) => void;
  deleteShift: (s: Shift) => void;
}) {
  const { setShowShifts, shifts, openEditShift, deleteShift } = props;
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowShifts(false)}>
          <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">Shift templates</h3>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setShowShifts(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-auto">
              {shifts.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--color-muted-fg)]">No shift templates yet — create one with <span className="font-medium">New shift template</span>.</p>
              )}
              {shifts.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: s.color || "#0ea5e9" }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className={flexGap2}>
                      <span className="truncate text-sm font-semibold text-[var(--color-foreground)]">{s.name}</span>
                      {s.is_active ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Active</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Inactive</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-[var(--color-muted-fg)]">
                      {String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
                      {s.department ? ` · ${s.department}` : ""}
                      {s.ward?.name ? ` · ${s.ward.name}` : ""}
                    </div>
                  </div>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]" onClick={() => openEditShift(s)}>
                    Edit
                  </button>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50" onClick={() => deleteShift(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
  );
}
