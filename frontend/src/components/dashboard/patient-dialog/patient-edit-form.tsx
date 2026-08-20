"use client";

import { Combobox } from "@/components/ui/combobox";
import { BLOOD_GROUPS, GENOTYPES, MARITAL_STATUSES, ErrorNote, capitalize, inputCls, labelCls } from "./patient-dialog-shared";
import type { PatientView } from "./patient-dialog-shared";

export function PatientEditForm({ view }: { view: PatientView }) {
  const detail = view.detail;
  const { error, depInfo, saveEdit, setEditMode, busy } = view;
  if (!detail) return null;
  return (
                <form
                  className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit(new FormData(e.currentTarget));
                  }}
                >
{error && <ErrorNote error={error} />}
                {depInfo && (
                  <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    {depInfo}
                  </p>
                )}
                  <div>
                    <label className={labelCls} htmlFor="e-dob">Date of Birth</label>
                    <input id="e-dob" name="dateOfBirth" type="date" defaultValue={detail.date_of_birth?.slice(0, 10) ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-phone">Phone</label>
                    <input id="e-phone" name="phone" defaultValue={detail.phone ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-email">Email</label>
                    <input id="e-email" name="email" type="email" defaultValue={detail.email ?? ""} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="e-address">Address</label>
                    <input id="e-address" name="address" defaultValue={detail.address ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-city">City</label>
                    <input id="e-city" name="city" defaultValue={detail.city ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-state">State</label>
                    <input id="e-state" name="state" defaultValue={detail.state ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-blood">Blood Group</label>
                    <Combobox
                      id="e-blood"
                      name="bloodGroup"
                      options={BLOOD_GROUPS}
                      normalize={(v) => v.trim().toUpperCase().replace(/0/g, "O")}
                      defaultValue={detail.blood_group ?? ""}
                      placeholder="Pick or Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-genotype">Genotype</label>
                    <Combobox
                      id="e-genotype"
                      name="genotype"
                      options={GENOTYPES}
                      normalize={(v) => v.trim().toUpperCase()}
                      defaultValue={detail.genotype ?? ""}
                      placeholder="Pick or Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-marital">Marital Status</label>
                    <Combobox
                      id="e-marital"
                      name="maritalStatus"
                      options={MARITAL_STATUSES}
                      normalize={capitalize}
                      defaultValue={detail.marital_status ? capitalize(detail.marital_status) : ""}
                      placeholder="Pick or Type"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-height">Height (cm)</label>
                    <input id="e-height" name="heightCm" type="number" defaultValue={detail.height_cm ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-weight">Weight (kg)</label>
                    <input id="e-weight" name="weightKg" type="number" defaultValue={detail.weight_kg ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-ec-name">Emergency Contact</label>
                    <input id="e-ec-name" name="emergencyName" defaultValue={detail.emergency_contact_name ?? ""} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="e-ec-phone">Emergency Phone</label>
                    <input id="e-ec-phone" name="emergencyPhone" defaultValue={detail.emergency_contact_phone ?? ""} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls} htmlFor="e-allergies">Allergies</label>
                    <input id="e-allergies" name="allergies" defaultValue={detail.allergies ?? ""} className={inputCls} />
                  </div>
                  <div className="flex gap-3 sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-medium hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                    >
                      {busy ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
  );
}
