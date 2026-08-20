"use client";

import type { Dispatch, SetStateAction } from "react";
import { ROLE_LABELS } from "@/lib/auth";
import { errorBanner, flexBetween, ghostIconBtn, labelSm, modalBackdrop, mutedXs } from "@/lib/ui-constants";
import { inputCls, rolesFor, type StaffUser } from "./staff-management-shared";

export function StaffRoleModal(props: {
  target: StaffUser;
  setTarget: Dispatch<SetStateAction<StaffUser | null>>;
  form: string;
  setForm: Dispatch<SetStateAction<string>>;
  myRole?: string;
  busy: boolean;
  error: string | null;
  onSave: () => Promise<void>;
}) {
  const { target: roleTarget, setTarget: setRoleTarget, form: roleForm, setForm: setRoleForm, myRole, busy, error, onSave: saveRole } = props;
  if (!roleTarget) return null;
  return (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Change role for ${roleTarget.full_name}`}
        >
          <div className="my-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                Change role — {roleTarget.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setRoleTarget(null)}
                className={ghostIconBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <label className={labelSm} htmlFor="cr-role">
                New role
              </label>
              <select
                id="cr-role"
                value={roleForm}
                onChange={(e) => setRoleForm(e.target.value)}
                className={inputCls}
              >
                {rolesFor(myRole).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <p className={mutedXs}>
                This controls what {roleTarget.full_name.split(" ")[0] ?? "they"} can see and do in the dashboard.
              </p>
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
                  onClick={() => setRoleTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveRole}
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
