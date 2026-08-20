"use client";

import { Eye, EyeOff } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { ROLE_LABELS } from "@/lib/auth";
import { errorBanner, flexBetween, ghostIconBtn, labelSm, modalBackdrop, mutedXsMt1 } from "@/lib/ui-constants";
import { inputCls, rolesFor, type BranchRow } from "./staff-management-shared";

export function StaffCreateModal(props: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  showPassword: boolean;
  setShowPassword: Dispatch<SetStateAction<boolean>>;
  busy: boolean;
  error: string | null;
  onCreate: (form: FormData) => Promise<void>;
  myRole?: string;
  branches: BranchRow[];
}) {
  const { open, setOpen: setShowCreate, showPassword: showStaffPassword, setShowPassword: setShowStaffPassword, busy, error, onCreate: handleCreate, myRole, branches } = props;
  if (!open) return null;
  return (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Add admin or staff"
        >
          <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                Add Admin / Staff
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
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
                handleCreate(new FormData(e.currentTarget));
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="s-fullName">
                    Full name
                  </label>
                  <input id="s-fullName" name="fullName" required className={inputCls} />
                </div>
                <div>
                  <label className={labelSm} htmlFor="s-email">
                    Email
                  </label>
                  <input id="s-email" name="email" type="email" required className={inputCls} />
                </div>
                <div>
                  <label className={labelSm} htmlFor="s-phone">
                    Phone
                  </label>
                  <input id="s-phone" name="phone" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="s-role">
                    Role
                  </label>
                  <select id="s-role" name="role" className={inputCls} defaultValue="nurse">
                    {rolesFor(myRole).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="s-branch">
                    Branch
                  </label>
                  <select id="s-branch" name="branchId" className={inputCls} defaultValue="">
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
                    Branch staff see that branch&apos;s stock and prices. Pick later from Edit details.
                  </p>
                </div>
                <div>
                  <label className={labelSm} htmlFor="s-dept">
                    Department
                  </label>
                  <input id="s-dept" name="department" className={inputCls} placeholder="e.g. Cardiology" />
                </div>
                <div>
                  <label className={labelSm} htmlFor="s-spec">
                    Specialization
                  </label>
                  <input id="s-spec" name="specialization" className={inputCls} placeholder="e.g. Consultant" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelSm} htmlFor="s-password">
                    Login password
                  </label>
                  <div className="relative">
                    <input
                      id="s-password"
                      name="password"
                      type={showStaffPassword ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="8+ characters"
                      className={`${inputCls} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowStaffPassword((v) => !v)}
                      className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-muted-fg)] transition-colors duration-200 hover:text-[var(--color-foreground)]"
                      aria-label={showStaffPassword ? "Hide password" : "Show password"}
                      aria-pressed={showStaffPassword}
                    >
                      {showStaffPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                    </button>
                  </div>
                  <p className={mutedXsMt1}>
                    The staff member signs in with this email + password at /login.
                  </p>
                </div>
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
onClick={() => {
                      setShowCreate(false);
                      setShowStaffPassword(false);
                    }}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
