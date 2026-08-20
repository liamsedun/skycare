"use client";

import type { Dispatch, SetStateAction } from "react";
import { errorBanner, flexBetween, ghostIconBtn, labelSm, modalBackdrop } from "@/lib/ui-constants";
import { inputCls, type StaffUser } from "./staff-management-shared";

export function StaffAvailabilityModal(props: {
  target: StaffUser;
  setTarget: Dispatch<SetStateAction<StaffUser | null>>;
  form: { is_available: boolean; available_from: string; available_until: string };
  setForm: Dispatch<SetStateAction<{ is_available: boolean; available_from: string; available_until: string }>>;
  busy: boolean;
  error: string | null;
  onSave: () => Promise<void>;
}) {
  const { target: availTarget, setTarget: setAvailTarget, form: availForm, setForm: setAvailForm, busy, error, onSave: saveAvailability } = props;
  if (!availTarget?.staff) return null;
  return (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Availability for ${availTarget.full_name}`}
        >
          <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                Availability — {availTarget.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setAvailTarget(null)}
                className={ghostIconBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={availForm.is_available}
                  onChange={(e) => setAvailForm((f) => ({ ...f, is_available: e.target.checked }))}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                Available for duty / appointments
              </label>
              {availForm.is_available && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelSm} htmlFor="av-from">
                      From
                    </label>
                    <input
                      id="av-from"
                      type="time"
                      value={availForm.available_from}
                      onChange={(e) => setAvailForm((f) => ({ ...f, available_from: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelSm} htmlFor="av-until">
                      Until
                    </label>
                    <input
                      id="av-until"
                      type="time"
                      value={availForm.available_until}
                      onChange={(e) => setAvailForm((f) => ({ ...f, available_until: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>
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
                  onClick={() => setAvailTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAvailability}
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
