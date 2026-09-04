"use client";

import { MapPin, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { fgMedium, mutedFg } from "@/lib/ui-constants";
import { ErrorNote, GENDERS, REL_STYLES, capitalize, formatDateOnly, inputCls, labelCls } from "./patient-dialog-shared";
import type { PatientView } from "./patient-dialog-shared";

export function PatientDependants({ view }: { view: PatientView }) {
  const detail = view.detail;
  const { error, busy, editDependant, setEditDependant, showAddDependant, setShowAddDependant, updateDependant, addDependant, removeDependant } = view;
  if (!detail) return null;
  return (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                    <Users size={15} aria-hidden="true" /> Dependants
                    <span className="text-xs font-normal text-[var(--color-muted-fg)]">
                      {detail.dependants.length} family {detail.dependants.length === 1 ? "member" : "members"}
                    </span>
                  </h3>
                  {!editDependant && (
                    <button
                      type="button"
                      onClick={() => setShowAddDependant((v) => !v)}
                      className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                    >
                      {showAddDependant ? "Close form" : "+ Add Dependant"}
                    </button>
                  )}
                </div>
                {error && <ErrorNote error={error} />}

                {detail.dependants.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {detail.dependants.map((d) =>
                      editDependant?.id === d.id ? (
                        <form
                          key={d.id}
                          className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)]/40 p-4 sm:grid-cols-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            updateDependant(d.id, new FormData(e.currentTarget));
                          }}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary-dark)] sm:col-span-2">
                            Edit Dependant — {d.first_name} {d.last_name}
                          </p>
                          <div>
                            <label className={labelCls} htmlFor={`dep-f-${d.id}`}>First Name</label>
                            <input id={`dep-f-${d.id}`} name="firstName" defaultValue={d.first_name} required className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-l-${d.id}`}>Last Name</label>
                            <input id={`dep-l-${d.id}`} name="lastName" defaultValue={d.last_name} required className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-g-${d.id}`}>Gender</label>
                            <Combobox
                              id={`dep-g-${d.id}`}
                              name="gender"
                              options={GENDERS}
                              normalize={capitalize}
                              defaultValue={d.gender ? capitalize(d.gender) : ""}
                              placeholder="Pick or Type"
                            />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-dob-${d.id}`}>Date of Birth</label>
                            <input id={`dep-dob-${d.id}`} name="dateOfBirth" type="date" defaultValue={d.date_of_birth?.slice(0, 10) ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-ph-${d.id}`}>Phone</label>
                            <input id={`dep-ph-${d.id}`} name="phone" defaultValue={d.phone ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-e-${d.id}`}>Email</label>
                            <input id={`dep-e-${d.id}`} name="email" type="email" defaultValue={d.email ?? ""} className={inputCls} placeholder="Used for their portal login" />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-r-${d.id}`}>Relationship</label>
                            <select id={`dep-r-${d.id}`} name="relationship" defaultValue={d.dependant_relationship ?? "other"} className={inputCls}>
                              <option value="spouse">Spouse</option>
                              <option value="child">Child</option>
                              <option value="parent">Parent</option>
                              <option value="sibling">Sibling</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls} htmlFor={`dep-a-${d.id}`}>Address</label>
                            <input id={`dep-a-${d.id}`} name="address" defaultValue={d.address ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-c-${d.id}`}>City</label>
                            <input id={`dep-c-${d.id}`} name="city" defaultValue={d.city ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-s-${d.id}`}>State</label>
                            <input id={`dep-s-${d.id}`} name="state" defaultValue={d.state ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-ec-${d.id}`}>Emergency Contact</label>
                            <input id={`dep-ec-${d.id}`} name="emergencyContactName" defaultValue={d.emergency_contact_name ?? ""} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls} htmlFor={`dep-ep-${d.id}`}>Emergency Phone</label>
                            <input id={`dep-ep-${d.id}`} name="emergencyContactPhone" defaultValue={d.emergency_contact_phone ?? ""} className={inputCls} />
                          </div>
                          <div className="flex gap-3 sm:col-span-2">
                            <button
                              type="button"
                              onClick={() => setEditDependant(null)}
                              disabled={busy}
                              className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={busy}
                              className="focus-ring flex-1 rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                            >
                              {busy ? "Saving…" : "Save Changes"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div
                          key={d.id}
                          className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-sm)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                        >
                          {(() => {
                            const rel = d.dependant_relationship ?? "other";
                            const s = REL_STYLES[rel] ?? REL_STYLES.other;
                            return (
                              <>
                                <div className={`absolute inset-y-0 left-0 w-1 ${s.bar}`} />
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${s.grad} text-sm font-bold text-white shadow-md ring-2 ring-white`}>
                                      {`${d.first_name[0] ?? ""}${d.last_name[0] ?? ""}`.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-[var(--color-foreground)]">
                                        {d.last_name}, {d.first_name}
                                      </p>
                                      <p className="font-mono text-[11px] text-[var(--color-muted-fg)]">{d.patient_number}</p>
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${s.badge}`}>
                                    {rel}
                                  </span>
                                </div>
                                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                                  <div>
                                    <dt className={mutedFg}>Gender</dt>
                                    <dd className="font-medium capitalize text-[var(--color-foreground)]">{d.gender ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Date of Birth</dt>
                                    <dd className={fgMedium}>
                                      {d.date_of_birth ? formatDateOnly(d.date_of_birth) : "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Phone</dt>
                                    <dd className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                                      {d.phone ? <a className="focus-ring font-semibold text-blue-600 hover:text-blue-700 hover:underline" href={`tel:${d.phone}`}>{d.phone}</a> : "—"}
                                    </dd>
                                  </div>
                                  <div className="col-span-2 sm:col-span-3">
                                    <dt className={mutedFg}>Address</dt>
                                    <dd className="flex items-start gap-1 font-medium text-[var(--color-foreground)]">
                                      <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-muted-fg)]" />
                                      {[d.address, d.city, d.state].filter(Boolean).join(", ") || "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Emergency Contact</dt>
                                    <dd className={fgMedium}>{d.emergency_contact_name ?? "—"}</dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Emergency Phone</dt>
                                    <dd className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                                      {d.emergency_contact_phone ? <a className="focus-ring font-semibold text-blue-600 hover:text-blue-700 hover:underline" href={`tel:${d.emergency_contact_phone}`}>{d.emergency_contact_phone}</a> : "—"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className={mutedFg}>Portal Access</dt>
                                    <dd className={fgMedium}>Via family account</dd>
                                  </div>
                                </dl>
                                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-[var(--color-border)] pt-2.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditDependant(d)}
                                    disabled={busy}
                                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-foreground)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                                  >
                                    <Pencil size={12} aria-hidden="true" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeDependant(d.id)}
                                    disabled={busy}
                                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors duration-200 hover:border-red-300 hover:bg-red-50"
                                  >
                                    <Trash2 size={12} aria-hidden="true" /> Remove
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )
                    )}
                  </div>
                )}

                {showAddDependant && detail.dependants.length < 5 && !editDependant && (
                  <form
                    className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addDependant(new FormData(e.currentTarget));
                    }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)] sm:col-span-2">
                      Add Dependant (Family Member on This Account)
                    </p>
                    <div>
                      <label className={labelCls} htmlFor="d-first">First Name</label>
                      <input id="d-first" name="firstName" required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-last">Last Name</label>
                      <input id="d-last" name="lastName" required className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-gender">Gender</label>
                      <Combobox
                        id="d-gender"
                        name="gender"
                        options={GENDERS}
                        normalize={capitalize}
                        placeholder="Pick or Type (e.g. Male)"
                      />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-dob">Date of Birth</label>
                      <input id="d-dob" name="dateOfBirth" type="date" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-phone">Phone</label>
                      <input id="d-phone" name="phone" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-email">Email</label>
                      <input id="d-email" name="email" type="email" className={inputCls} placeholder="For notifications and receipts" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-rel">Relationship</label>
                      <select id="d-rel" name="relationship" required className={inputCls}>
                        <option value="">Select…</option>
                        <option value="spouse">Spouse</option>
                        <option value="child">Child</option>
                        <option value="parent">Parent</option>
                        <option value="sibling">Sibling</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="d-address">Address</label>
                      <input id="d-address" name="address" defaultValue={detail.address ?? ""} className={inputCls} placeholder="Copied from main patient — editable" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-city">City</label>
                      <input id="d-city" name="city" defaultValue={detail.city ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-state">State</label>
                      <input id="d-state" name="state" defaultValue={detail.state ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-ec-name">Emergency Contact</label>
                      <input id="d-ec-name" name="emergencyContactName" defaultValue={detail.emergency_contact_name ?? ""} className={inputCls} placeholder="Copied from main patient — editable" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="d-ec-phone">Emergency Phone</label>
                      <input id="d-ec-phone" name="emergencyContactPhone" defaultValue={detail.emergency_contact_phone ?? ""} className={inputCls} placeholder="Copied from main patient — editable" />
                    </div>
                    <p className="text-xs text-[var(--color-muted-fg)] sm:col-span-2">
                      Address, City, State and emergency contacts are copied from the main patient record. You can adjust them here — they are editable later.
                    </p>
                    <button
                      type="submit"
                      disabled={busy}
                      className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60 sm:col-span-2"
                    >
                      <Plus size={15} aria-hidden="true" /> {busy ? "Adding…" : "Add Dependant"}
                    </button>
                  </form>
                )}
              </section>
  );
}
