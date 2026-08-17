"use client";

import { useState } from "react";
import { ArrowDownToLine, Download, FileUp, FileText, Upload } from "lucide-react";
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
  importExtra?: React.ReactNode;
  allowImport?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
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
  importExtra,
  allowImport = true,
  compact = false,
  iconOnly = false,
}: ImportExportMenuProps) {
  const [importOpen, setImportOpen] = useState(false);

  const triggerIcon = iconOnly ? (
    <span className="flex flex-col items-center leading-none" aria-hidden="true">
      <Download size={13} />
      <Upload size={13} />
    </span>
  ) : (
    <ArrowDownToLine size={compact ? 14 : 16} aria-hidden="true" />
  );

  return (
    <div className="relative">
      <ActionDropdown
        label="Import & Export"
        variant="outline"
        icon={triggerIcon}
        ariaLabel={`Import & export ${entityLabel}`}
        className={disabled ? "opacity-50" : ""}
        buttonClassName={iconOnly ? "px-2 py-1.5" : compact ? "px-3 py-2 text-xs" : undefined}
        iconOnly={iconOnly}
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
          ...(allowImport
            ? [{
                label: "Import (CSV/PDF)",
                description: `Add ${entityLabel} from a CSV or PDF file`,
                icon: <FileUp size={14} aria-hidden="true" />,
                onClick: () => setImportOpen(true),
              }]
            : []),
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
        extraContent={importExtra}
      />
    </div>
  );
}
