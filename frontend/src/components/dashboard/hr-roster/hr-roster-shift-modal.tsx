import { Loader2, X } from "lucide-react";
import { spinner } from "@/lib/ui-constants";
import type { Dispatch, SetStateAction } from "react";
import type { FormEvent } from "react";
import { inputCls, labelCls, type Shift } from "./hr-roster-shared";

export function ShiftFormModal(props: {
  setShowShift: Dispatch<SetStateAction<boolean>>;
  editingShift: Shift | null;
  shiftName: string;
  setShiftName: Dispatch<SetStateAction<string>>;
  shiftStart: string;
  setShiftStart: Dispatch<SetStateAction<string>>;
  shiftEnd: string;
  setShiftEnd: Dispatch<SetStateAction<string>>;
  shiftDept: string;
  setShiftDept: Dispatch<SetStateAction<string>>;
  shiftColor: string;
  setShiftColor: Dispatch<SetStateAction<string>>;
  error: string | null;
  busy: boolean;
  createShift: (e: FormEvent) => void;
}) {
  const { setShowShift, editingShift, shiftName, setShiftName, shiftStart, setShiftStart, shiftEnd, setShiftEnd, shiftDept, setShiftDept, shiftColor, setShiftColor, error, busy, createShift } = props;
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowShift(false)}>
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={createShift}>
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">{editingShift ? "Edit shift template" : "New shift template"}</h3>
              <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--color-muted)]" onClick={() => setShowShift(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Name</label>
                <input className={inputCls + " w-full"} placeholder="Morning" value={shiftName} onChange={(e) => setShiftName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Start</label>
                  <input type="time" className={inputCls + " w-full"} value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} required />
                </div>
                <div>
                  <label className={labelCls}>End</label>
                  <input type="time" className={inputCls + " w-full"} value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Department</label>
                <input className={inputCls + " w-full"} placeholder="Nursing" value={shiftDept} onChange={(e) => setShiftDept(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Colour</label>
                <input type="color" className={inputCls + " h-11 w-full"} value={shiftColor} onChange={(e) => setShiftColor(e.target.value)} />
              </div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {busy && <Loader2 className={spinner} />} {editingShift ? "Save changes" : "Create"}
              </button>
            </div>
          </form>
        </div>
  );
}
