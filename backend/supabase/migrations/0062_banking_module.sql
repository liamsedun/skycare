-- ============================================================================
-- SKYCARE — MIGRATION 0062: BANKING MODULE (CASH + BANKS)
--
-- The Banking module gives the hospital a single place where every receipt
-- lands and every payment leaves:
--   * CASH — a single virtual account per tenant, represented by a ledger row
--     with account_id IS NULL.
--   * BANKS — one account per hospital_bank_accounts row. Banks added (or
--     deactivated/renamed) by the admin in Settings → Bank Accounts show up
--     automatically; the ledger only stores account_id so it always reflects
--     the latest settings.
--
-- hospital_bank_ledger is written by the API layer (service client, audit-
-- logged) — auto-posts from confirmed invoice payments (incl. gateway),
-- other income and expenses, plus manual adjustments recorded in Banking.
-- Pharmacy sales keep their own pharmacy_bank_ledger (0061) and are merged
-- into the module's views at read time; nothing is double-posted.
-- RLS is SELECT-only for staff, mirroring pharmacy_bank_ledger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. BANK LEDGER (generic)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hospital_bank_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  account_id  uuid REFERENCES hospital_bank_accounts(id) ON DELETE SET NULL,
  -- NULL account_id = the hospital's CASH account
  direction   text NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  source      text NOT NULL DEFAULT 'adjustment'
              CHECK (source IN ('payment','other_income','expense','adjustment')),
  source_ref  text,
  payment_id  uuid REFERENCES payments(id) ON DELETE SET NULL,
  income_id   uuid REFERENCES other_income(id) ON DELETE SET NULL,
  expense_id  uuid REFERENCES expenses(id) ON DELETE SET NULL,
  method      text,
  reference   text,
  notes       text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_tenant_date
  ON hospital_bank_ledger (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_account
  ON hospital_bank_ledger (tenant_id, account_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_payment
  ON hospital_bank_ledger (tenant_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_expense
  ON hospital_bank_ledger (tenant_id, expense_id);
CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_income
  ON hospital_bank_ledger (tenant_id, income_id);

ALTER TABLE hospital_bank_ledger ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'hospital_bank_ledger'
                    AND policyname = 'hospital_bank_ledger_staff_read') THEN
    CREATE POLICY hospital_bank_ledger_staff_read ON hospital_bank_ledger
      FOR SELECT TO authenticated
      USING ((auth.jwt() ->> 'role') IN
        ('hospital_admin', 'cashier', 'accountant', 'pharmacist', 'doctor',
         'nurse', 'receptionist', 'lab_tech', 'hr_officer', 'super_admin'));
  END IF;
END $$;