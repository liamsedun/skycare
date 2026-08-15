-- ============================================================================
-- 0079_supplier_opening_balances.sql
-- Opening per-supplier balances for tenants migrating from another system
-- or spreadsheets. These are NOT activity rows (no POs/GRNs/payments are
-- faked) — they fold into the Balances tab totals as carried-forward money.
--
-- * one row per (tenant_id, supplier_id) — re-importing overwrites
-- * deleted with the supplier (ON DELETE CASCADE)
-- * RLS: staff SELECT only; writes via the service client (audit-logged),
--   mirroring supplier_payments (0066)
-- ============================================================================

CREATE TABLE IF NOT EXISTS pharmacy_supplier_opening_balances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES pharmacy_suppliers(id) ON DELETE CASCADE,
  total_bought numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_bought >= 0),
  total_paid   numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_opening_balances_tenant
  ON pharmacy_supplier_opening_balances (tenant_id);

ALTER TABLE pharmacy_supplier_opening_balances ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'pharmacy_supplier_opening_balances'
                    AND policyname = 'pharmacy_supplier_opening_balances_staff_read') THEN
    CREATE POLICY pharmacy_supplier_opening_balances_staff_read
      ON pharmacy_supplier_opening_balances
      FOR SELECT TO authenticated
      USING ((tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

GRANT SELECT ON TABLE pharmacy_supplier_opening_balances TO authenticated;