"use client";

import { CalendarPlus, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { errorBanner, flexBetween, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";
import { inputCls, labelCls } from "./patient-dialog-shared";
import type { PatientView } from "./patient-dialog-shared";

export function PatientActionsMenu({ view }: { view: PatientView }) {
  const { patient, busy, canDelete, menuOpen, setMenuOpen, setEditMode, setOpen, openSchedule, removeQuick } = view;
  return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setEditMode(false);
            setOpen(true);
          }}
          className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-primary)] transition-colors duration-200 hover:border-[var(--color-primary)]"
        >
          <Eye size={13} aria-hidden="true" /> View
        </button>
        <div className="relative shrink-0" data-patient-menu>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            aria-label={`More actions for ${patient.last_name}, ${patient.first_name}`}
            aria-expanded={menuOpen}
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditMode(true);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
              >
                <Pencil size={13} aria-hidden="true" /> Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openSchedule();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-muted)]"
              >
                <CalendarPlus size={13} aria-hidden="true" /> Schedule
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    removeQuick();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition-colors duration-150 hover:bg-red-50"
                >
                  <Trash2 size={13} aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
  );
}

export function PatientScheduleModal({ view }: { view: PatientView }) {
  const { patient, showSchedule, setShowSchedule, scheduleAppointment, doctors, schedError, schedBusy } = view;
  return (
    <>
      {showSchedule && (
        <div
          className={modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Schedule appointment for ${patient.last_name}, ${patient.first_name}`}
        >
          <div className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className={flexBetween}>
              <h2 className="text-lg font-bold">
                New Appointment — {patient.last_name}, {patient.first_name}
              </h2>
              <button
                type="button"
                onClick={() => setShowSchedule(false)}
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
                scheduleAppointment(new FormData(e.currentTarget));
              }}
            >
              <div>
                <label className={labelCls} htmlFor="sch-doctor">Doctor (optional)</label>
                <select id="sch-doctor" name="doctorId" className={inputCls}>
                  <option value="">No doctor assigned</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls} htmlFor="sch-date">Date</label>
                  <input
                    id="sch-date"
                    name="scheduledDate"
                    type="date"
                    required
                    min={new Date().toISOString().slice(0, 10)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sch-start">Start time</label>
                  <input id="sch-start" name="startTime" type="time" required className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-type">Type</label>
                <select id="sch-type" name="type" className={inputCls} defaultValue="in_person">
                  <option value="in_person">In-person visit</option>
                  <option value="telemedicine">Telemedicine</option>
                  <option value="home_visit">Home visit</option>
                  <option value="follow_up">Follow-up</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-reason">Reason</label>
                <input id="sch-reason" name="reason" className={inputCls} placeholder="Reason for visit" />
              </div>
              <div>
                <label className={labelCls} htmlFor="sch-notes">Notes (optional)</label>
                <textarea id="sch-notes" name="notes" rows={2} className={inputCls} />
              </div>
              {schedError && (
                <p
                  role="alert"
                  className={errorBanner}
                >
                  {schedError}
                </p>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSchedule(false)}
                  className="focus-ring flex-1 rounded-lg border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors duration-200 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedBusy}
                  className="focus-ring flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                >
                  <CalendarPlus size={15} aria-hidden="true" />
                  {schedBusy ? "Booking…" : "Book appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
