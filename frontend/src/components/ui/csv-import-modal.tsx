"use client";

import { useRef, useState } from "react";
import { Download, FileUp, X } from "lucide-react";
import { downloadCsv, parseCsv, parsePdfRows, type ExportCell } from "@/lib/export";

export interface ImportResult {
  created: number;
  failed: number;
  errors?: string[];
  notes?: string[];
}

interface CsvImportModalProps {
  open: boolean;
  title: string;
  description: string;
  columns: string[];
  sampleRows?: ExportCell[][];
  templateFilename: string;
  onClose: () => void;
  onImport: (rows: string[][]) => Promise<ImportResult>;
  onImported?: () => void;
  acceptPdf?: boolean;
  extraContent?: React.ReactNode;
}

export default function CsvImportModal({
  open,
  title,
  description,
  columns,
  sampleRows = [],
  templateFilename,
  onClose,
  onImport,
  onImported,
  acceptPdf = true,
  extraContent,
}: CsvImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  function downloadTemplate() {
    downloadCsv(templateFilename, columns, sampleRows);
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    let rows: string[][];
    try {
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      rows = isPdf ? await parsePdfRows(file) : parseCsv(await file.text());
      if (isPdf && columns.length > 0) {
        const headerIdx = rows.findIndex((r) =>
          r.some((c) => c.trim().toLowerCase() === columns[0]!.trim().toLowerCase())
        );
        if (headerIdx > 0) rows = rows.slice(headerIdx);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not read ${file.name}: ${e.message}`
          : `Could not read ${file.name}.`
      );
      return;
    }
    const dataRows = rows.slice(1);
    if (dataRows.length === 0) {
      setError("The file has no data rows (only a header). Add records and try again.");
      return;
    }
    setBusy(true);
    try {
      const r = await onImport(dataRows);
      setResult(r);
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="my-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <FileUp size={18} aria-hidden="true" className="text-[var(--color-primary-dark)]" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-[var(--color-muted-fg)] hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-sm text-[var(--color-muted-fg)]">{description}</p>

        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-fg)]">
            Expected columns (first row = header, order matters)
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <span
                key={c}
                className="rounded-md bg-white px-2 py-1 font-mono text-[11px] text-[var(--color-primary-dark)] shadow-sm"
              >
                {c}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-primary-dark)] transition-colors duration-200 hover:bg-[var(--color-primary-soft)]"
          >
            <Download size={13} aria-hidden="true" /> Download template
          </button>
        </div>

        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept={acceptPdf ? ".csv,text/csv,.pdf,application/pdf" : ".csv,text/csv"}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 px-4 py-6 text-sm font-semibold text-[var(--color-primary-dark)] transition-colors duration-200 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)] disabled:opacity-60"
          >
            <FileUp size={18} aria-hidden="true" />
            {busy ? "Importing…" : fileName ? "Choose a different file" : acceptPdf ? "Choose a .csv or .pdf file to import" : "Choose a .csv file to import"}
          </button>
          {fileName && !busy && (
            <p className="mt-2 truncate text-xs text-[var(--color-muted-fg)]">Selected: {fileName}</p>
          )}
        </div>

        {extraContent && <div className="mt-4">{extraContent}</div>}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-sm font-medium text-[var(--color-destructive)]"
          >
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 text-sm">
            <p className="font-semibold text-[var(--color-foreground)]">
              Import complete — {result.created} created, {result.failed} failed.
            </p>
            {result.notes && result.notes.length > 0 && (
              <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--color-muted-fg)]">
                {result.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--color-destructive-soft)] px-3 py-2 text-xs text-[var(--color-destructive)]">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
