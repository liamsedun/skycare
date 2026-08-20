"use client";

import { ClipboardList, ShieldAlert } from "lucide-react";
import { fgMedium, mutedXsMt } from "@/lib/ui-constants";
import { RECORD_TYPES, inputCls, labelCls } from "./patient-dialog-shared";
import type { PatientView } from "./patient-dialog-shared";

export function PatientMedicalRecordTab({ view }: { view: PatientView }) {
  const { records, showAddRecord, setShowAddRecord, busy, addRecord } = view;
  return (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]">
                    <ClipboardList size={15} aria-hidden="true" /> Medical Records
                    <span className="text-xs font-normal text-[var(--color-muted-fg)]">({records.length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddRecord((v) => !v)}
                    className="focus-ring rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                  >
                    {showAddRecord ? "Close form" : "+ Add Record"}
                  </button>
                </div>

                {showAddRecord && (
                  <form
                    className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addRecord(new FormData(e.currentTarget));
                    }}
                  >
                    <div>
                      <label className={labelCls} htmlFor="mr-type">Record type</label>
                      <select id="mr-type" name="recordType" required className={inputCls}>
                        {RECORD_TYPES.map((t) => (
                          <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="mr-title">Title</label>
                      <input id="mr-title" name="title" required className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="mr-content">Content / notes</label>
                      <textarea id="mr-content" name="content" rows={3} className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        name="isConfidential"
                        className="h-4 w-4 rounded border-[var(--color-border)] accent-red-500"
                      />
                      <span className="flex items-center gap-1 font-medium text-[var(--color-foreground)]">
                        <ShieldAlert size={14} aria-hidden="true" /> Confidential (hidden from patient portal)
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      className="focus-ring rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-60 sm:col-span-2"
                    >
                      {busy ? "Saving…" : "Save Record"}
                    </button>
                  </form>
                )}

                {records.length === 0 ? (
                  <p className="rounded-lg bg-[var(--color-muted)]/40 px-3 py-2 text-xs text-[var(--color-muted-fg)]">
                    No records yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {records.map((record) => (
                      <li
                        key={record.id}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={fgMedium}>{record.title}</p>
                            <p className={mutedXsMt}>
                              {record.record_type.replace(/_/g, " ")} ·{" "}
                              {new Date(record.created_at).toLocaleDateString()} ·{" "}
                              {record.users?.full_name ?? "—"}
                            </p>
                          </div>
                          {record.is_confidential && (
                            <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                              Confidential
                            </span>
                          )}
                        </div>
                        {record.content && (
                          <p className="mt-1.5 text-xs text-[var(--color-muted-fg)]">{record.content}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
  );
}
