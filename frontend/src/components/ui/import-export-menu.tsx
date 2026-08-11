"use client";

import { useState } from "react";
import { ArrowDownToLine, Download, FileUp, FileText } from "lucide-react";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import CsvImportModal, { type ImportResult } from "@/components/ui/csv-import-modal";
import type { ExportCell } from "@/lib/export";

interface ImportExportMenuProps {
  entityLabel: string;
  exportCsv: () => void;
  exportPdf: () => void;
  importTitle?: string;
  importDescription?: string;
  importColumns: string[];
  importSample?: ExportCell[][];
  templateFilename: string;
  onImport: (rows: string[][]) => Promise<ImportResult>;
  onImported?: () => void;
  disabled?: boolean;
}

/**
 * A single "Import & Export" button (dropdown) with Export CSV, Export PDF
 * and Import (CSV/PDF) actions, wired to the page's data via props.
 */
export default function ImportExportMenu({
  entityLabel,
  exportCsv,
  exportPdf,
  importTitle,
  importDescription,
  importColumns,
  importSample = [],
  templateFilename,
  onImport,
  onImported,
  disabled = false,
}: ImportExportMenuProps) {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="relative">
      <ActionDropdown
        label="Import & Export"
        variant="outline"
        icon={<ArrowDownToLine size={16} aria-hidden="true" />}
        ariaLabel={`Import & export ${entityLabel}`}
        className={disabled ? "opacity-50" : ""}
        items={[
          {
            label: "Export (CSV)",
            description: `Download ${entityLabel} as a spreadsheet`,
            icon: <FileText size={14} aria-hidden="true" />,
            onClick: exportCsv,
          },
          {
            label: "Export (PDF)",
            description: `Open a printable PDF of ${entityLabel}`,
            icon: <Download size={14} aria-hidden="true" />,
            onClick: exportPdf,
          },
          {
            label: "Import (CSV/PDF)",
            description: `Add ${entityLabel} from a CSV or PDF file`,
            icon: <FileUp size={14} aria-hidden="true" />,
            onClick: () => setImportOpen(true),
          },
        ]}
      />

      <CsvImportModal
        open={importOpen}
        title={importTitle ?? `Import ${entityLabel}`}
        description={
          importDescription ??
          `Add ${entityLabel} from a CSV or PDF file. The first data row must be the header with the columns below, in this order.`
        }
        columns={importColumns}
        sampleRows={importSample}
        templateFilename={templateFilename}
        onClose={() => setImportOpen(false)}
        onImport={onImport}
        onImported={onImported}
      />
    </div>
  );
}
