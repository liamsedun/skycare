-- ============================================================================
-- SKYCARE — MIGRATION 0075: BANKING EXTENSIONS (TRANSFERS / OPENING / PAYROLL)
--
--   * hospital_bank_ledger.source CHECK extended with THREE new sources:
--       'transfer'  — internal transfer between the hospital's own accounts
--                     (Cash <-> Bank or Bank <-> Bank); written as a paired
--                     'out' row on the source account and 'in' row on the
--                     destination, grouped by transfer_id.
--       'opening'   — one-time opening/carried-forward balance per account;
--                     direction 'in', excluded from month/period in-out
--                     (it is a carried-forward amount, not period activity).
--       'payroll'   — automatic 'out' posting when a payroll record is
--                     marked paid (idempotent via payroll_id).
--   * transfer_id uuid column groups the two rows of a transfer so the API
--     can delete/reverse both sides together.
--   * payroll_id uuid FK lets payroll posting self-guard against double
--     posting (one ledger row per payroll record).
-- ============================================================================

-- 1. Extend the source CHECK (idempotent — drop only when 'transfer' missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hospital_bank_ledger_source_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%transfer%'
  ) THEN
    ALTER TABLE hospital_bank_ledger DROP CONSTRAINT hospital_bank_ledger_source_check;
    ALTER TABLE hospital_bank_ledger
      ADD CONSTRAINT hospital_bank_ledger_source_check CHECK (
        source IN ('payment','other_income','expense','adjustment',
                   'supplier_payment','transfer','opening','payroll')
      );
  END IF;
END $$;

-- 2. Transfer grouping column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'hospital_bank_ledger'
                   AND column_name = 'transfer_id') THEN
    ALTER TABLE hospital_bank_ledger ADD COLUMN transfer_id uuid;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_transfer
  ON hospital_bank_ledger (tenant_id, transfer_id);

-- 3. Payroll posting link (idempotency guard for payroll -> ledger)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'hospital_bank_ledger'
                   AND column_name = 'payroll_id') THEN
    ALTER TABLE hospital_bank_ledger
      ADD COLUMN payroll_id uuid REFERENCES payroll_records(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_payroll
  ON hospital_bank_ledger (tenant_id, payroll_id);