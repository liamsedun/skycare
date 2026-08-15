/**
 * SkyBooks-style Nigerian payroll engine (port of SkyBooks'
 * `calculatePayrollForEmployee` — Nigeria Tax Act 2025 rates, effective 2026).
 * Money is Naira with 2-decimal rounding (SkyCare convention; SkyBooks used
 * integer kobo — same maths, different precision).
 *
 * Salary structure: Basic / Housing / Transport / Utilities / Meals / Others
 * as percentages of gross (sum-normalised to avoid rounding leaks).
 * Pension: pensionable earnings = gross × pensionable portion %, EE = pension
 * rate %, ER = 10%.
 * NHIS 5% of basic (employer 10%) when applicable; NHF 2.5% of basic.
 * PAYE: annualise, deduct EE pension + NHIS + NHF + rent relief (20% of annual
 * rent, max ₦500,000; default 4% of annual gross) + mortgage interest and life
 * assurance reliefs (each capped at annual gross), then apply progressive bands:
 *   0% on first ₦800k, 15% next ₦2.2m, 18% next ₦9m, 21% next ₦13m,
 *   23% next ₦25m, 25% above ₦50m.
 * Monthly PAYE = annual PAYE / 12. Net = gross − pension EE − NHIS − NHF − PAYE
 * − internal deductions.
 */

export interface TaxBandBreakdown {
  bandName: string;
  taxableAmount: number;
  rate: number;
  taxAmount: number;
}

export interface InternalDeduction {
  description: string;
  amount: number;
}

export interface HrPayrollConfig {
  basicSalaryPct: number;
  housingPct: number;
  transportPct: number;
  utilitiesPct: number;
  mealsPct: number;
  othersPct: number;
  pensionablePortionPct: number;
  pensionRatePct: number;
  nhisApplicable: boolean;
  nhfApplicable: boolean;
  annualRent: number;
  annualMortgageInterest: number;
  annualLifeAssurance: number;
  internalDeductions: InternalDeduction[];
}

export interface HrPayrollCalculation {
  grossPay: number;
  basicSalary: number;
  housing: number;
  transport: number;
  utilities: number;
  meals: number;
  otherAllowances: number;
  pensionableEarnings: number;
  pensionEE: number;
  pensionEmployer: number;
  nhis: number;
  nhisEmployer: number;
  nhf: number;
  annualGross: number;
  annualPension: number;
  annualNHIS: number;
  annualNHF: number;
  rentRelief: number;
  mortgageInterestRelief: number;
  lifeAssuranceRelief: number;
  chargeableIncome: number;
  annualPAYE: number;
  monthlyPAYE: number;
  effectiveRatePct: number;
  bandBreakdown: TaxBandBreakdown[];
  internalDeductions: InternalDeduction[];
  internalDeductionsTotal: number;
  netPay: number;
}

export const DEFAULT_HR_PAYROLL_CONFIG: HrPayrollConfig = {
  basicSalaryPct: 50,
  housingPct: 20,
  transportPct: 10,
  utilitiesPct: 10,
  mealsPct: 5,
  othersPct: 5,
  pensionablePortionPct: 80,
  pensionRatePct: 8,
  nhisApplicable: false,
  nhfApplicable: true,
  annualRent: 0,
  annualMortgageInterest: 0,
  annualLifeAssurance: 0,
  internalDeductions: [],
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const clampPct = (v: unknown, fallback: number, max = 100) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : fallback;
};

const money = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function calculateHrPayroll(grossPay: number, cfg: Partial<HrPayrollConfig> = {}): HrPayrollCalculation {
  const config: HrPayrollConfig = { ...DEFAULT_HR_PAYROLL_CONFIG, ...cfg };
  const gross = Number.isFinite(grossPay) && grossPay > 0 ? r2(grossPay) : 0;

  const basicSalaryPct = clampPct(config.basicSalaryPct, 50) / 100;
  const housingPct = clampPct(config.housingPct, 20) / 100;
  const transportPct = clampPct(config.transportPct, 10) / 100;
  const utilitiesPct = clampPct(config.utilitiesPct, 10) / 100;
  const mealsPct = clampPct(config.mealsPct, 5) / 100;
  const othersPct = clampPct(config.othersPct, 5) / 100;
  const pensionablePortionPct = clampPct(config.pensionablePortionPct, 80) / 100;
  const pensionRatePct = clampPct(config.pensionRatePct, 8, 30) / 100;
  const nhisApplicable = config.nhisApplicable === true;
  const nhfApplicable = config.nhfApplicable !== false;
  const annualRent = money(config.annualRent);
  const annualMortgageInterest = money(config.annualMortgageInterest);
  const annualLifeAssurance = money(config.annualLifeAssurance);
  const internalDeductionsList: InternalDeduction[] = Array.isArray(config.internalDeductions)
    ? config.internalDeductions
        .filter((d) => d && typeof d.description === "string" && Number.isFinite(Number(d.amount)))
        .map((d) => ({ description: String(d.description), amount: Math.abs(Number(d.amount)) }))
    : [];

  const sumPct = basicSalaryPct + housingPct + transportPct + utilitiesPct + mealsPct + othersPct;
  const basicSalary = r2((gross * basicSalaryPct) / sumPct);
  const housing = r2((gross * housingPct) / sumPct);
  const transport = r2((gross * transportPct) / sumPct);
  const utilities = r2((gross * utilitiesPct) / sumPct);
  const meals = r2((gross * mealsPct) / sumPct);
  const otherAllowances = r2(gross - basicSalary - housing - transport - utilities - meals);

  const pensionableEarnings = r2(gross * pensionablePortionPct);
  const pensionEE = r2(pensionableEarnings * pensionRatePct);
  const pensionEmployer = r2(pensionableEarnings * 0.1);
  const nhis = nhisApplicable ? r2(basicSalary * 0.05) : 0;
  const nhisEmployer = nhisApplicable ? r2(basicSalary * 0.1) : 0;
  const nhf = nhfApplicable ? r2(basicSalary * 0.025) : 0;

  const annualGross = r2(gross * 12);
  const annualPension = r2(pensionEE * 12);
  const annualNHIS = r2(nhis * 12);
  const annualNHF = r2(nhf * 12);

  const rentRelief =
    annualRent > 0 ? Math.min(r2(annualRent * 0.2), 500000) : Math.min(r2(annualGross * 0.2 * 0.2), 500000);
  const mortgageInterestRelief = Math.min(annualMortgageInterest, annualGross);
  const lifeAssuranceRelief = Math.min(annualLifeAssurance, annualGross);

  const chargeableIncome = Math.max(
    0,
    r2(annualGross - annualPension - annualNHIS - annualNHF - rentRelief - mortgageInterestRelief - lifeAssuranceRelief)
  );

  const bands: { name: string; limit: number; rate: number }[] = [
    { name: "First ₦800,000 @ 0%", limit: 800000, rate: 0 },
    { name: "Next ₦2,200,000 @ 15%", limit: 2200000, rate: 0.15 },
    { name: "Next ₦9,000,000 @ 18%", limit: 9000000, rate: 0.18 },
    { name: "Next ₦13,000,000 @ 21%", limit: 13000000, rate: 0.21 },
    { name: "Next ₦25,000,000 @ 23%", limit: 25000000, rate: 0.23 },
    { name: "Above ₦50,000,000 @ 25%", limit: Infinity, rate: 0.25 },
  ];

  let remaining = chargeableIncome;
  let annualPAYE = 0;
  const bandBreakdown: TaxBandBreakdown[] = [];
  for (const band of bands) {
    if (remaining <= 0) break;
    const taxableInBand = Math.min(remaining, band.limit);
    const taxInBand = r2(taxableInBand * band.rate);
    annualPAYE = r2(annualPAYE + taxInBand);
    remaining = r2(remaining - taxableInBand);
    bandBreakdown.push({ bandName: band.name, taxableAmount: r2(taxableInBand), rate: band.rate, taxAmount: taxInBand });
  }

  const monthlyPAYE = r2(annualPAYE / 12);
  const internalDeductionsTotal = r2(internalDeductionsList.reduce((s, d) => s + d.amount, 0));
  const netPay = Math.max(0, r2(gross - pensionEE - nhis - nhf - monthlyPAYE - internalDeductionsTotal));
  const effectiveRatePct = annualGross > 0 ? Number((annualPAYE / annualGross) * 100) : 0;

  return {
    grossPay: gross,
    basicSalary,
    housing,
    transport,
    utilities,
    meals,
    otherAllowances,
    pensionableEarnings,
    pensionEE,
    pensionEmployer,
    nhis,
    nhisEmployer,
    nhf,
    annualGross,
    annualPension,
    annualNHIS,
    annualNHF,
    rentRelief,
    mortgageInterestRelief,
    lifeAssuranceRelief,
    chargeableIncome,
    annualPAYE,
    monthlyPAYE,
    effectiveRatePct: Number(effectiveRatePct.toFixed(2)),
    bandBreakdown,
    internalDeductions: internalDeductionsList,
    internalDeductionsTotal,
    netPay,
  };
}