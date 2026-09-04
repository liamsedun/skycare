import { downloadCsv, letterheadHtml } from "@/lib/export";
import { getTenantCurrency } from "@/lib/currency";

export interface HrRun {
  runNumber: string;
  period: string;
  payDate: string | null;
  status: string;
  staffCount: number;
  gross: number;
  paye: number;
  pensionEE: number;
  pensionER: number;
  nhf: number;
  nhis: number;
  net: number;
}

export interface HrRunLine {
  id: string;
  staff_id: string;
  pay_period: string;
  run_number: string | null;
  pay_date: string | null;
  base_salary: number;
  allowances: number;
  deductions: number;
  overtime_pay: number;
  bonus: number;
  net_salary: number;
  worked_days: number;
  absent_days: number;
  overtime_hours: number;
  status: string;
  generated_at: string;
  approved_by: string | null;
  notes: string | null;
  paye: number;
  pension_ee: number;
  pension_employer: number;
  nhf: number;
  nhis: number;
  nhis_employer: number;
  other_deductions: number;
  internal_deductions_total: number;
  tax_relief: number;
  annual_gross: number;
  chargeable_income: number;
  effective_rate_pct: number;
  calc: Record<string, any> | null;
  staff: {
    staff_number: string;
    department: string | null;
    specialization: string | null;
    users: { full_name: string; role: string; email: string } | null;
    profiles: {
      bank_name: string | null;
      bank_account_number: string | null;
      pension_pin: string | null;
      nhf_number: string | null;
      tax_id: string | null;
    } | null;
  } | null;
}

export const fmtN = (n: number, currency?: string) => {
  const v = n ?? 0;
  const cur = currency || getTenantCurrency() || "NGN";
  if (cur !== "NGN") return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(v);
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export const STATUS_CHIP: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  approved: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export function calcOf(line: HrRunLine): Record<string, any> {
  return (line.calc ?? {}) as Record<string, any>;
}

/** Chargeable income: the engine's stored statutory figure (annual). */
export function chargeableOf(line: HrRunLine): number {
  const c = calcOf(line);
  const stored = Number(line.chargeable_income) || Number(c.chargeableIncome);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return Math.max(
    0,
    (Number(line.annual_gross) || 0) -
      (Number(line.tax_relief) || 0) -
      (Number(line.pension_ee) || 0) * 12 -
      (Number(line.nhf) || 0) * 12
  );
}

export async function fetchRuns(): Promise<HrRun[]> {
  const res = await fetch("/api/hr/payroll/runs", { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to load payroll runs");
  return body.data ?? [];
}

export async function fetchRunDetail(runNumber: string): Promise<{ run: HrRun; lines: HrRunLine[] }> {
  const res = await fetch(`/api/hr/payroll/runs/${encodeURIComponent(runNumber)}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to load run");
  return body.data;
}

export async function bulkDeleteLines(runNumber: string, ids: string[]): Promise<{ action: string; processed: number; skipped: { id: string; reason: string }[]; errors: string[] }> {
  const res = await fetch("/api/hr/payroll/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", ids }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Delete failed");
  return body.data;
}

export function downloadScheduleCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  downloadCsv(filename, headers, rows);
}

export interface PrintScheduleOptions {
  title: string;
  periodLine?: string;
  headers: string[];
  rows: string[];
  totalsRow?: string;
  rightAligned?: number[];
  brandFetch?: Promise<Record<string, any> | null>;
}

export async function printScheduleDoc(opts: PrintScheduleOptions): Promise<void> {
  const brand = await (opts.brandFetch ??
    fetch("/api/tenant/branding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.resolve({ data: null })))
      .then((b) => (b?.data as Record<string, any> | null) ?? null)
      .catch(() => null));
  const right = new Set(opts.rightAligned ?? []);
  const head = opts.headers
    .map((h, i) => `<th class="${right.has(i) ? "r" : ""}">${String(h).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</th>`)
    .join("");
  const body = `${opts.rows.join("")}${opts.totalsRow ?? ""}`;
  const html = `<!DOCTYPE html><html><head><title>${opts.title.replace(/[<>&"]/g, "")}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:40px;color:#1e293b}
    .title-section{display:flex;justify-content:space-between;align-items:flex-end;margin:18px 0 14px}
    .report-title{font-size:18px;font-weight:700;color:#0f172a}
    .period-info{font-size:11px;color:#64748b;margin-top:4px}
    table{width:100%;border-collapse:collapse}
    th{background:#0f172a;color:#fff;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em}
    th.r{text-align:right}
    td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px}
    td.r{text-align:right;font-family:monospace}
    tr:nth-child(even) td{background:#f8fafc}
    tr.total-row td{background:#f1f5f9;font-weight:700;border-top:2px solid #0f172a}
    .footer{margin-top:40px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}
    @media print{body{padding:20px}}
  </style></head><body>
    ${letterheadHtml(brand)}
    <div class="title-section">
      <div>
        <div class="report-title">${opts.title.replace(/[<>&"]/g, "")}</div>
        ${opts.periodLine ? `<div class="period-info">${opts.periodLine}</div>` : ""}
      </div>
    </div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="footer">${brand?.name ?? "SkyCare"} &bull; ${opts.title.replace(/[<>&"]/g, "")} &bull; Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</div>
  </body></html>`;
  openPrintWindow(html);
}

export function openPrintWindow(html: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Your browser blocked the print window. Allow pop-ups for this site to export the PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

/** SkyBooks-style payslip document (SkyCare data + engine calc snapshot). */
export function payslipPrintHtml(line: HrRunLine, run: { runNumber: string; period: string; payDate: string | null }, brand: Record<string, any> | null): string {
  const c = calcOf(line);
  const name = brand?.name ? String(brand.name) : "SkyCare HMS";
  const emp = line.staff?.users;
  const staffNo = line.staff?.staff_number ?? "";
  const dept = line.staff?.department ?? "";
  const pf = line.staff?.profiles ?? null;
  const intDedArr = Array.isArray(c.internalDeductions) ? c.internalDeductions : [];
  const intDedTotal = intDedArr.reduce((s: number, d: { amount: number }) => s + (Number(d.amount) || 0), 0);
  const eRows = [
    ["Basic Salary", c.basicSalary ?? 0],
    ["Housing Allowance", c.housing ?? 0],
    ["Transport Allowance", c.transport ?? 0],
    ["Utilities Allowance", c.utilities ?? 0],
    ["Meals Allowance", c.meals ?? 0],
    ["Other Allowances", c.otherAllowances ?? 0],
  ];
  const sRows = [
    ["PAYE Tax", line.paye ?? c.monthlyPAYE ?? 0],
    ["Pension (EE)", line.pension_ee ?? c.pensionEE ?? 0],
    ["NHIS", line.nhis ?? c.nhis ?? 0],
    ["NHF", line.nhf ?? c.nhf ?? 0],
  ];
  const totalDed = sRows.reduce((s: number, r) => s + (Number(r[1]) || 0), 0) + intDedTotal;
  const gross = line.base_salary || c.grossPay || 0;
  const net = line.net_salary || c.netPay || 0;
  const bands = Array.isArray(c.bandBreakdown)
    ? c.bandBreakdown
        .map(
          (b: { bandName: string; taxableAmount: number; rate: number; taxAmount: number }) =>
            `<tr><td>${String(b.bandName).replace(/[<>&"]/g, "")}</td><td class="r">${fmtN(Number(b.taxableAmount) || 0)}</td><td class="r">${((Number(b.rate) || 0) * 100).toFixed(0)}%</td><td class="r">${fmtN(Number(b.taxAmount) || 0)}</td></tr>`
        )
        .join("")
    : "";
  const esc = (v: unknown) => String(v ?? "").replace(/[<>&"]/g, "");
  const payPeriod = run.payDate ? `${fmtDate(run.period)} — Pay date ${fmtDate(run.payDate)}` : fmtDate(run.period);
  const logo = brand?.logo_url
    ? `<img src="${esc(brand.logo_url)}" alt="logo" style="width:56px;height:56px;object-fit:contain;border-radius:10px;" />`
    : `<div style="width:56px;height:56px;border-radius:10px;background:#0369a1;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;">${esc((name.trim()[0] ?? "S").toUpperCase())}</div>`;
  return `<!DOCTYPE html><html><head><title>Payslip — ${esc(emp?.full_name ?? "")}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;padding:32px;font-size:11px;color:#1a1d23}
    .page{max-width:820px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,0.07);overflow:hidden}
    .header{background:#0f172a;padding:18px 30px 14px;display:flex;align-items:center;justify-content:space-between}
    .hleft{display:flex;align-items:center;gap:14px}
    .hname{color:#fff;font-size:15px;font-weight:700}
    .hsub{color:#94a3b8;font-size:9px;margin-top:3px}
    .badge{background:rgba(255,255,255,0.12);color:#e0f2fe;padding:5px 16px;border-radius:18px;font-size:12px;font-weight:800;letter-spacing:0.04em}
    .body{padding:16px 30px 20px}
    .emp{display:flex;justify-content:space-between;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #eef1f5}
    .ename{font-size:16px;font-weight:700;color:#0f172a}
    .emeta{font-size:10px;color:#6b7a90;margin-top:2px}
    .period{text-align:right;font-size:10px;color:#6b7a90;line-height:1.5}
    .grid{display:flex;gap:14px;margin-bottom:6px}
    .grid>div{flex:1;min-width:0}
    .sec{font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#8b9ab0;margin-bottom:5px}
    .card{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
    .crow{display:flex;justify-content:space-between;padding:5px 12px;font-size:10px;border-bottom:1px solid #f1f5f9}
    .crow:last-child{border-bottom:none}
    .crow .lb{color:#475569}.crow .vl{font-weight:600;color:#0f172a}
    .crow.total{background:#f1f5f9;border-top:2px solid #0f172a;font-weight:700}
    .net{background:linear-gradient(135deg,#0f172a,#1e40af);border-radius:12px;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;color:#fff}
    .net .nl{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#bfdbfe}
    .net .na{font-size:18px;font-weight:800}
    table.bands{width:100%;border-collapse:separate;border-spacing:0;font-size:8.5px}
    table.bands th{padding:5px 8px;text-align:left;color:#fff;font-size:6.5px;text-transform:uppercase;background:#0f172a}
    table.bands td{padding:4px 8px;border-bottom:1px solid #eef2f6}
    table.bands .r{text-align:right;font-weight:700}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .metric{border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center;background:#fafbfc}
    .metric .ml{font-size:6px;color:#8b9ab0;text-transform:uppercase;letter-spacing:0.05em;font-weight:700}
    .metric .mv{font-size:10px;font-weight:700;color:#0f172a;margin-top:2px}
    .foot{text-align:center;padding:14px 30px;border-top:1px solid #e2e8f0;font-size:7.5px;color:#94a3b8}
    @media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0}}
  </style></head><body>
  <div class="page">
    <div class="header">
      <div class="hleft">${logo}<div><div class="hname">${esc(name)}</div><div class="hsub">${esc([brand?.address, brand?.phone, brand?.email].filter(Boolean).join(" • "))}</div></div></div>
      <div class="badge">PAYSLIP ${esc(run.runNumber)}</div>
    </div>
    <div class="body">
      <div class="emp">
        <div>
          <div class="ename">${esc(emp?.full_name ?? "")}</div>
          <div class="emeta">${esc([staffNo, dept, emp?.role].filter(Boolean).join(" • "))}</div>
          ${emp?.email ? `<div class="emeta">${esc(emp.email)}</div>` : ""}
        </div>
        <div class="period"><strong>${esc(payPeriod)}</strong><br>Status: ${esc(line.status)}</div>
      </div>
      <div class="grid">
        <div>
          <div class="sec">Earnings</div>
          <div class="card">${eRows.map(([l, v]) => `<div class="crow"><span class="lb">${esc(l)}</span><span class="vl">${fmtN(Number(v) || 0)}</span></div>`).join("")}<div class="crow total"><span class="lb">Total Gross</span><span class="vl">${fmtN(gross)}</span></div></div>
        </div>
        <div>
          <div class="sec">Statutory Deductions</div>
          <div class="card">${sRows.map(([l, v]) => `<div class="crow"><span class="lb">${esc(l)}</span><span class="vl">${fmtN(Number(v) || 0)}</span></div>`).join("")}${intDedArr.map((d: { description: string; amount: number }) => `<div class="crow"><span class="lb">${esc(d.description)}</span><span class="vl">${fmtN(Number(d.amount) || 0)}</span></div>`).join("")}<div class="crow total"><span class="lb">Total Deductions</span><span class="vl">${fmtN(totalDed)}</span></div></div>
          <div style="margin-top:6px"><div class="sec">Employer Contributions</div>
          <div class="card"><div class="crow"><span class="lb">Pension (ER 10%)</span><span class="vl">${fmtN(Number(line.pension_employer) || 0)}</span></div><div class="crow total"><span class="lb">Total Pension Obligation</span><span class="vl">${fmtN((Number(line.pension_ee) || 0) + (Number(line.pension_employer) || 0))}</span></div></div></div>
        </div>
      </div>
      <div class="net"><div><div class="nl">Net Pay</div><div style="font-size:7px;color:#bfdbfe;margin-top:2px">After all statutory &amp; internal deductions</div></div><div class="na">${fmtN(net)}</div></div>
      ${c && Number.isFinite(Number(c.annualGross)) ? `
      <div class="grid">
        <div>
          <div class="sec">Tax Computation (Annual)</div>
          <div class="card">
            <div class="crow"><span class="lb">Annual Gross</span><span class="vl">${fmtN(Number(c.annualGross) || gross * 12)}</span></div>
            <div class="crow"><span class="lb">Less: Pension (EE)</span><span class="vl">${fmtN(Number(c.annualPension) || 0)}</span></div>
            <div class="crow"><span class="lb">Less: NHIS</span><span class="vl">${fmtN(Number(c.annualNHIS) || 0)}</span></div>
            <div class="crow"><span class="lb">Less: NHF</span><span class="vl">${fmtN(Number(c.annualNHF) || 0)}</span></div>
            <div class="crow"><span class="lb">Less: Rent Relief</span><span class="vl">${fmtN(Number(c.rentRelief) || 0)}</span></div>
            <div class="crow"><span class="lb">Less: Mortgage Interest</span><span class="vl">${fmtN(Number(c.mortgageInterestRelief) || 0)}</span></div>
            <div class="crow"><span class="lb">Less: Life Assurance</span><span class="vl">${fmtN(Number(c.lifeAssuranceRelief) || 0)}</span></div>
            <div class="crow total"><span class="lb">Chargeable Income</span><span class="vl">${fmtN(Number(c.chargeableIncome) || 0)}</span></div>
            <div class="crow"><span class="lb">Annual PAYE</span><span class="vl">${fmtN(Number(c.annualPAYE) || 0)}</span></div>
            <div class="crow"><span class="lb">Effective Rate</span><span class="vl">${Number(c.effectiveRatePct ?? 0).toFixed(2)}%</span></div>
          </div>
        </div>
        <div>
          <div class="sec">Payment Info</div>
          <div class="card">
            <div class="crow"><span class="lb">Bank</span><span class="vl">${esc(pf?.bank_name ?? "—")}</span></div>
            <div class="crow"><span class="lb">Account</span><span class="vl">${esc(pf?.bank_account_number ?? "—")}</span></div>
            <div class="crow"><span class="lb">Tax ID</span><span class="vl">${esc(pf?.tax_id ?? "—")}</span></div>
            ${pf?.pension_pin ? `<div class="crow"><span class="lb">Pension PIN</span><span class="vl">${esc(pf.pension_pin)}</span></div>` : ""}
            ${pf?.nhf_number ? `<div class="crow"><span class="lb">NHF Number</span><span class="vl">${esc(pf.nhf_number)}</span></div>` : ""}
          </div>
        </div>
      </div>
      ${bands ? `<div style="margin-top:16px"><div class="sec">Tax Band Breakdown</div><div class="card"><table class="bands"><thead><tr><th>Band</th><th style="text-align:right">Taxable Amount</th><th style="text-align:right">Rate</th><th style="text-align:right">Tax</th></tr></thead><tbody>${bands}</tbody></table></div></div>` : ""}
      <div style="margin-top:16px"><div class="sec">Annual Overview</div>
        <div class="metrics">
          <div class="metric"><div class="ml">Annual Gross</div><div class="mv">${fmtN(Number(c.annualGross) || gross * 12)}</div></div>
          <div class="metric"><div class="ml">Annual PAYE</div><div class="mv">${fmtN(Number(c.annualPAYE) || 0)}</div></div>
          <div class="metric"><div class="ml">Monthly PAYE</div><div class="mv">${fmtN(line.paye ?? 0)}</div></div>
          <div class="metric"><div class="ml">Annual Net Pay</div><div class="mv">${fmtN((Number(net) || 0) * 12)}</div></div>
        </div>
      </div>` : ""}
    </div>
    <div class="foot">${esc(name)} &bull; Confidential &bull; Computer-generated document &bull; ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</div>
  </div></body></html>`;
}