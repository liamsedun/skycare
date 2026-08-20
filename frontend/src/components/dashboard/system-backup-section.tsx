"use client";

import { mutedFg, errorBanner, cardTitle } from "@/lib/ui-constants";
import { useRef, useState } from "react";
import { DatabaseBackup, Download, Loader2, RotateCcw, Upload } from "lucide-react";

export default function SystemBackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function download() {
    setBusy("download");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/system/backup", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create backup");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = match?.[1] ?? `skycare-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setResult("Backup downloaded. Keep it somewhere safe — it contains your full hospital data.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create backup");
    } finally {
      setBusy(null);
    }
  }

  async function restore(file: File) {
    let text: string;
    try {
      text = await file.text();
      JSON.parse(text);
    } catch {
      setError("Invalid backup file — expected a SkyCare backup JSON");
      return;
    }
    if (!window.confirm("Restore will REPLACE all current hospital data with the backup contents. Continue?")) return;
    setBusy("restore");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/system/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Restore failed");
      const u = body.data?.users ?? {};
      const restored = Object.entries(body.data?.restored ?? {}).length;
      setResult(
        `Restore complete: ${restored} tables restored, ${u.reusedAccounts ?? 0} existing accounts reused, ${u.createdAccounts ?? 0} accounts recreated with a temporary password (reset them from Settings → Users).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (
      !window.confirm(
        "System reset will PERMANENTLY DELETE all entered data: patients, staff, records, prescriptions, lab orders, invoices, payments, expenses, appointments, attendance, rosters, chats, mail and audit logs. Your account, hospital profile, catalogues, bank accounts, website doctors and templates are kept. Continue?"
      )
    ) {
      return;
    }
    if (!window.confirm("This cannot be undone. Type the final confirmation to proceed.")) return;
    setBusy("reset");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/system/reset", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Reset failed");
      setResult(body.data?.message ?? "System reset complete.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-sm)]">
      <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
        <DatabaseBackup size={16} aria-hidden="true" className={mutedFg} />
        <h2 className={cardTitle}>System backup &amp; reset</h2>
      </header>

      <div className="space-y-4 p-4">
        {error && (
          <p role="alert" className={errorBanner}>
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {result}
          </p>
        )}

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className={cardTitle}>Backup</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-fg)]">
            Downloads every table of this hospital (patients, records, billing, pharmacy, lab, HR and configuration) as a JSON file.
          </p>
          <button
            type="button"
            onClick={download}
            disabled={busy !== null}
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy === "download" ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Download size={14} aria-hidden="true" />}
            {busy === "download" ? "Preparing…" : "Download backup"}
          </button>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className={cardTitle}>Restore</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-fg)]">
            Replaces ALL current hospital data with a backup file. Missing login accounts are recreated with a temporary password.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-foreground)] hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === "restore" ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Upload size={14} aria-hidden="true" />}
            {busy === "restore" ? "Restoring…" : "Choose backup file…"}
          </button>
        </div>

        <div className="rounded-lg border border-[var(--color-destructive)]/30 bg-[var(--color-destructive-soft)] p-3">
          <p className="text-sm font-semibold text-[var(--color-destructive)]">Reset system</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-fg)]">
            Permanently deletes all entered data for this hospital (see confirmation). Keep: hospital profile, catalogues, bank accounts, website doctors and templates.
          </p>
          <button
            type="button"
            onClick={reset}
            disabled={busy !== null}
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-destructive)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy === "reset" ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <RotateCcw size={14} aria-hidden="true" />}
            {busy === "reset" ? "Resetting…" : "Reset system"}
          </button>
        </div>
      </div>
    </section>
  );
}
