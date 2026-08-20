"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, HeartPulse, KeyRound, PhoneCall, Plus, UserRound } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { mutedXsMt1 } from "@/lib/ui-constants";
import { BLOOD_GROUPS, GENDERS, GENOTYPES, MARITAL_STATUSES, Modal, capitalize, inputCls, labelCls } from "./patient-dialog-shared";
export function AddPatientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalLogin, setPortalLogin] = useState(false);
  const [portalEmail, setPortalEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [showPortalPassword, setShowPortalPassword] = useState(false);
  const [email, setEmail] = useState("");

  async function handleSubmit(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          otherNames: form.get("otherNames") || undefined,
          gender: form.get("gender") || undefined,
          dateOfBirth: form.get("dateOfBirth") || undefined,
          phone: form.get("phone") || undefined,
          email: email || undefined,
          address: form.get("address") || undefined,
          city: form.get("city") || undefined,
          state: form.get("state") || undefined,
          bloodGroup: form.get("bloodGroup") || undefined,
          genotype: form.get("genotype") || undefined,
          allergies: form.get("allergies") || undefined,
          heightCm: form.get("heightCm") ? Number(form.get("heightCm")) : undefined,
          weightKg: form.get("weightKg") ? Number(form.get("weightKg")) : undefined,
          emergencyContactName: form.get("emergencyName") || undefined,
          emergencyContactPhone: form.get("emergencyPhone") || undefined,
          maritalStatus: form.get("maritalStatus") || undefined,
          portalEmail: portalLogin ? portalEmail : undefined,
          portalPassword: portalLogin ? portalPassword : undefined,
          mustChangePassword: portalLogin ? form.get("mustChangePassword") === "on" : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to register patient");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register patient");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      title="Register Patient"
      onClose={onClose}
      error={error}
      busy={busy}
      submitLabel={busy ? "Registering…" : "Register Patient"}
      onSubmit={handleSubmit}
      wide
    >
          <div className="space-y-5">
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <UserRound size={13} aria-hidden="true" />
                </span>
                Personal details
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="p-first">First Name</label>
                  <input id="p-first" name="firstName" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-last">Last Name</label>
                  <input id="p-last" name="lastName" required className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-other">Other Names</label>
                  <input id="p-other" name="otherNames" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-gender">Gender</label>
                  <Combobox
                    id="p-gender"
                    name="gender"
                    options={GENDERS}
                    normalize={capitalize}
                    placeholder="Pick or Type (e.g. Male)"
                  />
                  <p className={mutedXsMt1}>Pick or Type an option, or add one not listed.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-dob">Date of Birth</label>
                  <input id="p-dob" name="dateOfBirth" type="date" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-phone">Phone</label>
                  <input id="p-phone" name="phone" type="tel" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="p-email">Email</label>
                  <input
                    id="p-email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (!portalEmail) setPortalEmail(e.target.value);
                    }}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="p-address">Address</label>
                  <input id="p-address" name="address" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-city">City</label>
                  <input id="p-city" name="city" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-state">State</label>
                  <input id="p-state" name="state" className={inputCls} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <HeartPulse size={13} aria-hidden="true" />
                </span>
                Clinical Info
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="p-blood">Blood Group</label>
                  <Combobox
                    id="p-blood"
                    name="bloodGroup"
                    options={BLOOD_GROUPS}
                    normalize={(v) => v.trim().toUpperCase().replace(/0/g, "O")}
                    placeholder="Pick or Type (e.g. O+)"
                  />
                  <p className={mutedXsMt1}>Pick an option or add one not listed.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-genotype">Genotype</label>
                  <Combobox
                    id="p-genotype"
                    name="genotype"
                    options={GENOTYPES}
                    normalize={(v) => v.trim().toUpperCase()}
                    placeholder="Pick or Type (e.g. AA)"
                  />
                  <p className={mutedXsMt1}>Pick an option or add one not listed.</p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-marital">Marital Status</label>
                  <Combobox
                    id="p-marital"
                    name="maritalStatus"
                    options={MARITAL_STATUSES}
                    normalize={capitalize}
                    placeholder="Pick or Type (e.g. Single)"
                  />
                  <p className={mutedXsMt1}>
                    Pick or Type — e.g. Single, Married, Divorced, Widowed, Separated.
                  </p>
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-height">Height (cm)</label>
                  <input id="p-height" name="heightCm" type="number" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-weight">Weight (kg)</label>
                  <input id="p-weight" name="weightKg" type="number" className={inputCls} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <PhoneCall size={13} aria-hidden="true" />
                </span>
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="p-ec-name">Emergency Contact</label>
                  <input id="p-ec-name" name="emergencyName" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="p-ec-phone">Emergency Phone</label>
                  <input id="p-ec-phone" name="emergencyPhone" type="tel" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="p-allergies">Allergies</label>
                  <input id="p-allergies" name="allergies" placeholder="e.g. Penicillin" className={inputCls} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/25 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]">
                  <KeyRound size={13} aria-hidden="true" />
                </span>
                Patient portal login
              </h3>
              <p className="mb-3 text-xs text-[var(--color-muted-fg)]">
                Give the patient a temporary welcome password they can use to sign in at /login. They&apos;ll be
                prompted to set their own password after the first login.
              </p>
              <label className="mb-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={portalLogin}
                  onChange={(e) => setPortalLogin(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                />
                Give this patient portal login (sign in at /login)
              </label>
              {portalLogin && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="p-portal-email">Portal login email</label>
                    <input
                      id="p-portal-email"
                      type="email"
                      value={portalEmail}
                      onChange={(e) => setPortalEmail(e.target.value)}
                      placeholder="Defaults to the patient email above"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="p-portal-pass">Temporary Password (welcome password)</label>
                    <div className="relative">
                      <input
                        id="p-portal-pass"
                        type={showPortalPassword ? "text" : "password"}
                        value={portalPassword}
                        onChange={(e) => setPortalPassword(e.target.value)}
                        placeholder="8+ characters"
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPortalPassword((v) => !v)}
                        className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-muted-fg)] hover:bg-slate-100"
                        aria-label={showPortalPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPortalPassword}
                      >
                        {showPortalPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      name="mustChangePassword"
                      defaultChecked
                      className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                    />
                    <span>Require password change at first login</span>
                  </label>
                </div>
              )}
            </section>
          </div>
        </Modal>
  );
}

export function AddPatientButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)]"
      >
        <Plus size={16} aria-hidden="true" /> Register Patient
      </button>
      <AddPatientModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}