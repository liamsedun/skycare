"use client";

import type { Dispatch, SetStateAction } from "react";
import { fmtDate } from "@/lib/shift-format";
import { errorBanner, flexBetween, ghostIconBtn, labelSm, modalBackdrop, mutedSmPlain } from "@/lib/ui-constants";
import { inputCls, type DutyStatus, type StaffUser } from "./staff-management-shared";

export function StaffLeaveModal(props: {
  target: StaffUser;
  setTarget: Dispatch<SetStateAction<StaffUser | null>>;
  form: { on_leave_until: string };
  setForm: Dispatch<SetStateAction<{ on_leave_until: string }>>;
  dutyStatusOf: (user: StaffUser) => Exclude<DutyStatus, "all">;
  busy: boolean;
  error: string | null;
  onSave: () => Promise<void>;
}) {
  const { target: leaveTarget, setTarget: setLeaveTarget, form: leaveForm, setForm: setLeaveForm, dutyStatusOf, busy, error, onSave: saveLeave } = props;
  if (!leaveTarget?.staff) return null;
  return (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Leave for ${leaveTarget.full_name}`}
        >
          <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                {dutyStatusOf(leaveTarget) === "on_leave"
                  ? `Return to duty — ${leaveTarget.full_name}`
                  : `Mark on leave — ${leaveTarget.full_name}`}
              </h2>
              <button
                type="button"
                onClick={() => setLeaveTarget(null)}
                className={ghostIconBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {dutyStatusOf(leaveTarget) === "on_leave" ? (
                <p className={mutedSmPlain}>
                  {leaveTarget.full_name} is currently on leave until{" "}
                  {leaveTarget.staff.on_leave_until ? fmtDate(leaveTarget.staff.on_leave_until) : ""}. Clear the date
                  below to return them to duty.
                </p>
              ) : (
                <p className={mutedSmPlain}>
                  They will show as &quot;On Leave&quot; and not appear as available until this date.
                </p>
              )}
              <label className={labelSm} htmlFor="lv-date">
                Leave until
              </label>
              <input
                id="lv-date"
                type="date"
                value={leaveForm.on_leave_until}
                onChange={(e) => setLeaveForm((f) => ({ ...f, on_leave_until: e.target.value }))}
                className={inputCls}
              />
              {dutyStatusOf(leaveTarget) === "on_leave" && (
                <button
                  type="button"
                  onClick={() => setLeaveForm((f) => ({ ...f, on_leave_until: "" }))}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Clear date — return to duty
                </button>
              )}
              {error && (
                <p
                  role="alert"
                  className={errorBanner}
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setLeaveTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveLeave}
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
  );
}
