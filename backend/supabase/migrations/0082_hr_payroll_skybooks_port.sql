-- ============================================================================
-- 0082: SkyBooks-style payroll port (Nigeria Tax Act 2025 engine)
--   * staff_profiles gains per-employee payroll configuration (salary struct
--     percentages, pension/NHIS/NHF flags, annual reliefs, internal deductions,
--     statutory identifiers) — mirrors SkyBooks `employees` payroll params.
--   * payroll_records gains run metadata (PR-XXXX run number, pay date) and
--     statutory breakdown columns + a frozen `calc` JSONB snapshot (earnings,
--     deductions, tax bands) produced by the shared calculation engine.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. STAFF PROFILES — payroll configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS pensionable_portion_pct int NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS pension_rate_pct         int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS nhis_applicable          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nhf_applicable           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS basic_salary_pct         int NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS housing_pct              int NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS transport_pct            int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS utilities_pct            int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS meals_pct                int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS others_pct               int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS annual_rent              numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_mortgage_interest numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_life_assurance    numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_deductions      jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pension_pin              text,
  ADD COLUMN IF NOT EXISTS nhf_number               text,
  ADD COLUMN IF NOT EXISTS tax_id                   text;

ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS chk_sp_pct_range,
  ADD CONSTRAINT chk_sp_pct_range CHECK (
    pensionable_portion_pct BETWEEN 0 AND 100 AND
    pension_rate_pct BETWEEN 0 AND 100 AND
    basic_salary_pct BETWEEN 0 AND 100 AND
    housing_pct BETWEEN 0 AND 100 AND
    transport_pct BETWEEN 0 AND 100 AND
    utilities_pct BETWEEN 0 AND 100 AND
    meals_pct BETWEEN 0 AND 100 AND
    others_pct BETWEEN 0 AND 100
  );

-- ---------------------------------------------------------------------------
-- 2. PAYROLL RECORDS — run metadata + statutory breakdown + frozen snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS run_number              text,
  ADD COLUMN IF NOT EXISTS pay_date                date,
  ADD COLUMN IF NOT EXISTS paye                    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_ee              numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_employer        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nhf                     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nhis                    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nhis_employer           numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS internal_deductions_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_relief              numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_gross            numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chargeable_income       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_rate_pct      numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calc                    jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payroll_run_number ON payroll_records (tenant_id, run_number);
CREATE INDEX IF NOT EXISTS idx_payroll_pay_date ON payroll_records (tenant_id, pay_date);