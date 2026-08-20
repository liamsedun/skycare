import { describe, expect, it } from "vitest";
import { calculateHrPayroll, DEFAULT_HR_PAYROLL_CONFIG } from "@/lib/hr-payroll-calc";

describe("calculateHrPayroll — known vectors (pinned by the prod smoke)", () => {
  it("computes the 2.5M doctor vector exactly", () => {
    const r = calculateHrPayroll(2_500_000);
    expect(r.basicSalary).toBe(1_250_000);
    expect(r.housing).toBe(500_000);
    expect(r.transport).toBe(250_000);
    expect(r.utilities).toBe(250_000);
    expect(r.meals).toBe(125_000);
    expect(r.otherAllowances).toBe(125_000);
    expect(r.pensionableEarnings).toBe(2_000_000);
    expect(r.pensionEE).toBe(160_000);
    expect(r.pensionEmployer).toBe(200_000);
    expect(r.nhis).toBe(0);
    expect(r.nhf).toBe(31_250);
    expect(r.annualGross).toBe(30_000_000);
    expect(r.annualPension).toBe(1_920_000);
    expect(r.annualNHF).toBe(375_000);
    expect(r.rentRelief).toBe(500_000); // 4% fallback capped at 500k
    expect(r.chargeableIncome).toBe(27_205_000);
    expect(r.monthlyPAYE).toBe(432_262.5);
    expect(r.annualPAYE).toBe(5_187_150);
    expect(r.netPay).toBe(1_876_487.5);
    expect(r.effectiveRatePct).toBe(17.29);
  });

  it("records the band breakdown with the last 23% slice at 2,205,000", () => {
    const r = calculateHrPayroll(2_500_000);
    expect(r.bandBreakdown).toHaveLength(5);
    expect(r.bandBreakdown[0]).toMatchObject({ bandName: expect.stringContaining("₦800,000"), rate: 0, taxableAmount: 800_000 });
    expect(r.bandBreakdown[4]).toMatchObject({ bandName: expect.stringContaining("₦25,000,000"), rate: 0.23, taxableAmount: 2_205_000, taxAmount: 507_150 });
  });
});

describe("calculateHrPayroll — edge cases", () => {
  it("pays no tax when the annual chargeable income is under 800k", () => {
    const r = calculateHrPayroll(60_000);
    expect(r.annualPAYE).toBe(0);
    expect(r.monthlyPAYE).toBe(0);
    expect(r.netPay).toBe(55_410); // gross − pension EE 3,840 − NHF 750
    expect(r.bandBreakdown).toHaveLength(1);
  });

  it("applies NHIS employee and employer shares when enabled", () => {
    const r = calculateHrPayroll(500_000, { nhisApplicable: true });
    const basic = r.basicSalary; // 250,000
    expect(r.nhis).toBe(basic * 0.05);
    expect(r.nhisEmployer).toBe(basic * 0.1);
  });

  it("subtracts internal deductions from net and reports the total", () => {
    const r = calculateHrPayroll(500_000, {
      internalDeductions: [
        { description: "Staff housing", amount: 25_000 },
        { description: "Loan", amount: 10_000 },
      ],
    });
    expect(r.internalDeductionsTotal).toBe(35_000);
    expect(r.netPay).toBe(500_000 - 32_000 - 6_250 - 62_015 - 35_000);
    expect(r.internalDeductions).toEqual([
      { description: "Staff housing", amount: 25_000 },
      { description: "Loan", amount: 10_000 },
    ]);
  });

  it("uses the annual-rent relief (20% capped at 500k) when rent is configured", () => {
    const noRent = calculateHrPayroll(2_500_000).rentRelief;
    const withRent = calculateHrPayroll(2_500_000, { annualRent: 1_000_000 });
    expect(withRent.rentRelief).toBe(200_000); // 20% of 1,000,000, under cap
    const capped = calculateHrPayroll(2_500_000, { annualRent: 4_000_000 });
    expect(capped.rentRelief).toBe(500_000);
    expect(noRent).toBe(500_000);
  });

  it("caps mortgage and life assurance reliefs at annual gross", () => {
    const r = calculateHrPayroll(2_500_000, { annualMortgageInterest: 99_000_000, annualLifeAssurance: 50_000_000 });
    expect(r.mortgageInterestRelief).toBe(30_000_000);
    expect(r.lifeAssuranceRelief).toBe(30_000_000);
  });

  it("clamps out-of-range percentages and turns non-finite gross into 0", () => {
    const r = calculateHrPayroll(Number.NaN);
    expect(r.grossPay).toBe(0);
    expect(r.netPay).toBe(0);

    const weird = calculateHrPayroll(1_000_000, {
      basicSalaryPct: 900,
      pensionRatePct: 99,
      pensionablePortionPct: 200,
    } as never);
    expect(weird.basicSalary).toBe(666_666.67); // pct clamped to 100, normalised over the 50% other allowances
    expect(weird.pensionEE).toBe(300_000); // rate clamped to 30 × portion clamped to 100
  });

  it("keeps defaults intact and round-trips a full custom config", () => {
    expect(DEFAULT_HR_PAYROLL_CONFIG.basicSalaryPct).toBe(50);
    expect(DEFAULT_HR_PAYROLL_CONFIG.pensionRatePct).toBe(8);
    expect(DEFAULT_HR_PAYROLL_CONFIG.nhfApplicable).toBe(true);
    expect(DEFAULT_HR_PAYROLL_CONFIG.nhisApplicable).toBe(false);

    const cfg = {
      ...DEFAULT_HR_PAYROLL_CONFIG,
      basicSalaryPct: 60,
      housingPct: 15,
      transportPct: 10,
      utilitiesPct: 5,
      mealsPct: 5,
      othersPct: 5,
      pensionRatePct: 11,
    };
    const r = calculateHrPayroll(1_000_000, cfg);
    expect(r.pensionEE).toBe(88_000); // 80% portina × 11%
    expect(r.basicSalary).toBe(600_000);
    expect(r.housing).toBe(150_000);
  });
});