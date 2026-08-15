export type ExportCell = string | number | null | undefined;

/** Org identity loaded for print letterheads (mirrors GET /api/tenant/branding). */
interface PrintBranding {
  name?: string | null;
  logo_url?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  website?: string | null;
}

const pdfWorkerUrl = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export function escapeCsv(val: ExportCell): string {
  const s = val == null ? "" : String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: ExportCell[][]
) {
  const bom = "\uFEFF";
  const csv =
    bom +
    [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetch the tenant's org identity for print letterheads. Fails silently —
 * printers fall back to a title-only document when branding can't load.
 */
async function loadBranding(): Promise<PrintBranding | null> {
  try {
    const res = await fetch("/api/tenant/branding", { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return (body.data as PrintBranding | undefined) ?? null;
  } catch {
    return null;
  }
}

function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Letterhead block (logo, name, address, phone, email, website) for print docs. */
export function letterheadHtml(brand: PrintBranding | null | undefined): string {
  if (!brand) return "";
  const name = brand.name || "SkyCare HMS";
  const address = [
    brand.address,
    [brand.city, brand.state].filter(Boolean).join(", "),
    brand.country,
  ]
    .filter(Boolean)
    .join(", ");
  const contact = [
    brand.phone && `Tel: ${brand.phone}`,
    brand.email && `Email: ${brand.email}`,
    brand.website,
  ]
    .filter(Boolean)
    .join(" &nbsp;&bull;&nbsp; ");
  const logo = brand.logo_url
    ? `<img src="${escHtml(brand.logo_url)}" alt="logo" style="width:52px;height:52px;object-fit:contain;" />`
    : `<div style="width:52px;height:52px;border-radius:8px;background:#e0f2fe;border:1px solid #bae6fd;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#0369a1;">${escHtml((name.trim()[0] ?? "S").toUpperCase())}</div>`;
  return `<div class="lh" style="display:flex;align-items:center;gap:14px;border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:10px;">
    ${logo}
    <div>
      <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${escHtml(name)}</p>
      ${address ? `<p style="margin:2px 0 0;font-size:11px;color:#475569;">${escHtml(address)}</p>` : ""}
      ${contact ? `<p style="margin:2px 0 0;font-size:10px;color:#64748b;">${contact}</p>` : ""}
    </div>
  </div>`;
}

export function printTable(
  title: string,
  columns: string[],
  rows: ExportCell[][]
) {
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${columns.map((_, i) => `<td>${esc(r[i])}</td>`).join("")}</tr>`
    )
    .join("");
  void (async () => {
    const brand = await loadBranding();
    const headerHtml = letterheadHtml(brand);
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #0f172a; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.sub { color: #64748b; font-size: 12px; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #f1f5f9; color: #334155; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 10px; }
  tr:nth-child(even) td { background: #f8fafc; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  ${headerHtml}
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(rows.length)} record(s) &middot; generated ${esc(
    new Date().toLocaleString("en-GB")
  )}</p>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body>
</html>`;
    const w = window.open("", "_blank");
    if (!w) {
      alert("Your browser blocked the print window. Allow pop-ups for this site to export the PDF.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  })();
}

/** Split a text line into cells on runs of 2+ spaces (how printTable PDFs lay out). */
export function splitPdfLine(line: string): string[] {
  const cells = line.split(/\s{2,}/).map((c) => c.trim());
  if (cells[0] === "") cells.shift();
  return cells;
}

/**
 * Extract tabular rows from a PDF file (client-side, pdfjs-dist).
 * Returns rows as string[][] with the header first — same shape as parseCsv.
 * Designed for PDFs produced by printTable(); arbitrary PDFs may parse loosely.
 */
export async function parsePdfRows(file: File): Promise<string[][]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const rows: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    for (const item of content.items) {
      if ("str" in item) {
        const s = item.str;
        line += s;
        if (item.hasEOL) {
          if (line.trim()) rows.push(splitPdfLine(line));
          line = "";
        }
      }
    }
    if (line.trim()) rows.push(splitPdfLine(line));
  }
  return rows;
}