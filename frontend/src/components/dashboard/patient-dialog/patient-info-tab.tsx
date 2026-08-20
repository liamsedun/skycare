"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { calculateAge, capitalize, formatDateOnly } from "./patient-dialog-shared";
import type { PatientView } from "./patient-dialog-shared";
import { PatientDependants } from "./patient-dependants";
import { PatientEditForm } from "./patient-edit-form";

export function PatientInfoTab({ view }: { view: PatientView }) {
  return (
    <>
      {view.editMode ? <PatientEditForm view={view} /> : <PatientInfoDisplay view={view} />}
      <PatientDependants view={view} />
    </>
  );
}

export function PatientInfoDisplay({ view }: { view: PatientView }) {
  const detail = view.detail;
  const { depInfo } = view;
  if (!detail) return null;
  return (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 shadow-[var(--shadow-sm)]">
                {depInfo && (
                  <p role="status" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    {depInfo}
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                  {[
                    ["Date of Birth", detail.date_of_birth ? formatDateOnly(detail.date_of_birth) : "—"],
                    ["Age", detail.date_of_birth ? calculateAge(detail.date_of_birth) : "—"],
                    ["Blood Group", detail.blood_group],
                    ["Genotype", detail.genotype],
                    ["Height", detail.height_cm ? `${detail.height_cm} cm` : "—"],
                    ["Weight", detail.weight_kg ? `${detail.weight_kg} kg` : "—"],
                    ["Marital Status", detail.marital_status ? capitalize(detail.marital_status) : "—"],
                    ["Emergency Contact", detail.emergency_contact_name],
                    ["Allergies", detail.allergies],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">{k}</dt>
                      <dd className="mt-0.5 font-medium text-[var(--color-foreground)]">{v ?? "—"}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Address</dt>
                    <dd className="mt-0.5 flex items-start gap-1.5 font-medium text-[var(--color-foreground)]">
                      <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--color-muted-fg)]" />
                      {[detail.address, detail.city, detail.state].filter(Boolean).join(", ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Phone</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                      {detail.phone ? (
                        <a className="focus-ring font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline" href={`tel:${detail.phone}`}>{detail.phone}</a>
                      ) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Email</dt>
                    <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                      <Mail size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                      {detail.email ? (
                        <a className="focus-ring truncate font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline" href={`mailto:${detail.email}`}>{detail.email}</a>
                      ) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-[var(--color-muted-fg)]">Emergency Phone</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                      <Phone size={12} aria-hidden="true" className="shrink-0 text-[var(--color-muted-fg)]" />
                      {detail.emergency_contact_phone ? (
                        <a className="focus-ring font-semibold text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline" href={`tel:${detail.emergency_contact_phone}`}>{detail.emergency_contact_phone}</a>
                      ) : "—"}
                    </dd>
                  </div>
                </dl>
                </div>
  );
}
