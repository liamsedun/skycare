export type ExportCell = string | number | null | undefined;

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
}