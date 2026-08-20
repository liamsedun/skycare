"use client";

import type { Dispatch, SetStateAction } from "react";
import { ROLE_LABELS } from "@/lib/auth";
import { errorBanner, flexBetween, ghostIconBtn, labelSm, modalBackdrop, mutedXsMt1 } from "@/lib/ui-constants";
import { inputCls, rolesFor, type BranchRow, type StaffUser } from "./staff-management-shared";

export function StaffEditModal(props: {
  target: StaffUser;
  setTarget: Dispatch<SetStateAction<StaffUser | null>>;
  busy: boolean;
  error: string | null;
  onSave: (form: FormData) => Promise<void>;
  myRole?: string;
  branches: BranchRow[];
}) {
  const { target: editTarget, setTarget: setEditTarget, busy, error, onSave: saveStaffDetails, myRole, branches } = props;
  if (!editTarget?.staff) return null;
  return (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Edit staff details"
        >
          <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                Edit details — {editTarget.full_name}
              </h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className={ghostIconBtn}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveStaffDetails(new FormData(e.currentTarget));
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="sd-name">
                    Full name
                  </label>
                  <input
                    id="sd-name"
                    name="fullName"
                    required
                    className={inputCls}
                    defaultValue={editTarget.full_name}
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-email">
                    Email
                  </label>
                  <input
                    id="sd-email"
                    name="email"
                    type="email"
                    required
                    className={inputCls}
                    defaultValue={editTarget.email}
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-phone">
                    Phone
                  </label>
                  <input
                    id="sd-phone"
                    name="phone"
                    className={inputCls}
                    defaultValue={editTarget.phone ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="sd-role">
                    Role
                  </label>
                  <select
                    id="sd-role"
                    name="role"
                    className={inputCls}
                    defaultValue={editTarget.role}
                  >
                    {Array.from(new Set([editTarget.role, ...rolesFor(myRole)])).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="sd-branch">
                    Branch
                  </label>
                  <select
                    id="sd-branch"
                    name="branchId"
                    className={inputCls}
                    defaultValue={editTarget.branch_id ?? ""}
                  >
                    <option value="">— No branch (all branches) —</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.isMain ? " (main)" : ""}
                        {!b.isActive ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className={mutedXsMt1}>
                    Branch staff see that branch&apos;s stock and prices.
                  </p>
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-dept">
                    Department
                  </label>
                  <input
                    id="sd-dept"
                    name="department"
                    className={inputCls}
                    defaultValue={editTarget.staff.department ?? ""}
                    placeholder="e.g. Cardiology"
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-spec">
                    Specialization
                  </label>
                  <input
                    id="sd-spec"
                    name="specialization"
                    className={inputCls}
                    defaultValue={editTarget.staff.specialization ?? ""}
                    placeholder="e.g. Consultant"
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-lic">
                    License number
                  </label>
                  <input
                    id="sd-lic"
                    name="license_number"
                    className={inputCls}
                    defaultValue={editTarget.staff.license_number ?? ""}
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-qual">
                    Qualification
                  </label>
                  <input
                    id="sd-qual"
                    name="qualification"
                    className={inputCls}
                    defaultValue={editTarget.staff.qualification ?? ""}
                    placeholder="e.g. MBBS, MD"
                  />
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-emp">
                    Employment type
                  </label>
                  <select
                    id="sd-emp"
                    name="employment_type"
                    className={inputCls}
                    defaultValue={editTarget.staff.employment_type ?? "full_time"}
                  >
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                    <option value="contract">Contract</option>
                    <option value="locum">Locum</option>
                  </select>
                </div>
                <div>
                  <label className={labelSm} htmlFor="sd-years">
                    Years of experience
                  </label>
                  <input
                    id="sd-years"
                    name="years_of_exp"
                    type="number"
                    min={0}
                    className={inputCls}
                    defaultValue={editTarget.staff.years_of_exp ?? ""}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="sd-salary">
                    Base salary (₦)
                  </label>
                  <input
                    id="sd-salary"
                    name="base_salary"
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputCls}
                    defaultValue={editTarget.staff.base_salary ?? ""}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name="is_available"
                    defaultChecked={editTarget.staff.is_available}
                    className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                  />
                  Available for duty / appointments
                </label>
              </div>
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
                  onClick={() => setEditTarget(null)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save details"}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
