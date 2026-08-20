"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserRoundPlus } from "lucide-react";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import ImportExportMenu from "@/components/ui/import-export-menu";
import type { ImportResult } from "@/components/ui/csv-import-modal";
import { AddPatientModal, type PatientRow } from "@/components/dashboard/patient-dialog";
import { dateStamp, downloadCsv, printTable } from "@/lib/export";
import { flexWrapGap2 } from "@/lib/ui-constants";

const EXPORT_COLUMNS = [
  "patient_number",
  "first_name",
  "last_name",
  "gender",
  "date_of_birth",
  "phone",
  "email",
  "city",
  "state",
  "status",
];

const IMPORT_COLUMNS = [
  "first_name",
  "last_name",
  "gender",
  "date_of_birth",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "blood_group",
  "marital_status",
];

const IMPORT_SAMPLE = [
  ["Ada", "Okafor", "Female", "1990-04-12", "0803 000 1111", "ada.okafor@example.com", "12 Unity Road", "Enugu", "Enugu", "O+", "Single"],
];

export default function PatientActions({ patients }: { patients: PatientRow[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const rowsFor = (ps: PatientRow[]) =>
    ps.map((p) => [
      p.patient_number,
      p.first_name,
      p.last_name,
      p.gender ?? "",
      p.date_of_birth ?? "",
      p.phone ?? "",
      p.email ?? "",
      p.city ?? "",
      p.state ?? "",
      p.status,
    ]);

  function exportCsv() {
    if (patients.length === 0) {
      alert("Nothing to export — there are no patients yet.");
      return;
    }
    downloadCsv(`patients-${dateStamp()}.csv`, EXPORT_COLUMNS, rowsFor(patients));
  }

  function exportPdf() {
    if (patients.length === 0) {
      alert("Nothing to export — there are no patients yet.");
      return;
    }
    printTable("Patients List", EXPORT_COLUMNS, rowsFor(patients));
  }

  async function importPatients(rows: string[][]): Promise<ImportResult> {
    const records = rows.map((r) => ({
      firstName: r[0]?.trim(),
      lastName: r[1]?.trim(),
      gender: r[2]?.trim() || undefined,
      dateOfBirth: r[3]?.trim() || undefined,
      phone: r[4]?.trim() || undefined,
      email: r[5]?.trim() || undefined,
      address: r[6]?.trim() || undefined,
      city: r[7]?.trim() || undefined,
      state: r[8]?.trim() || undefined,
      bloodGroup: r[9]?.trim() || undefined,
      maritalStatus: r[10]?.trim() || undefined,
    }));
    const res = await fetch("/api/patients/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Import failed");
    // The API wraps results in the { success, data } envelope.
    const payload = (body as { data?: { created?: number; errors?: Array<{ row?: number; message?: string }> } }).data ?? {};
    const errors = (payload.errors ?? []).map(
      (e: { row?: number; message?: string }) =>
        `Row ${e.row ?? "?"}: ${e.message ?? "Unknown error"}`
    );
    return { created: payload.created ?? 0, failed: errors.length, errors };
  }

  return (
    <div className={flexWrapGap2}>
      <ActionDropdown
        label="New"
        icon={<Plus size={16} aria-hidden="true" />}
        items={[
          {
            label: "Patient",
            description: "Register a single patient",
            icon: <UserRoundPlus size={14} aria-hidden="true" />,
            onClick: () => setAddOpen(true),
          },
        ]}
      />
      <ImportExportMenu
        entityLabel="Patients"
        exportCsv={exportCsv}
        exportPdf={exportPdf}
        importColumns={IMPORT_COLUMNS}
        importSample={IMPORT_SAMPLE}
        templateFilename="patients-import-template.csv"
        onImport={importPatients}
        onImported={() => router.refresh()}
      />

      <AddPatientModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}