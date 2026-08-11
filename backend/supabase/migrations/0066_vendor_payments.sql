-- ============================================================================
-- SKYCARE — MIGRATION 0066: VENDOR PAYMENTS & SUPPLIER BALANCES
--
-- Completes the procurement loop (0040 built the PO/GRN engine; this adds
-- the money side):
--   * supplier_payments        — every payment/credit made to a supplier,
--                                optionally tied to a purchase order
--   * hospital_bank_ledger     — source 'supplier_payment' + FK column, so
--                                instant bank-transfer / cash / POS payments
--                                debit the hospital's bank ledger exactly like
--                                expenses do (banking module, 0062)
--   * pharmacy_supplier_balances(tenant) — per-supplier totals:
--                                bought (GRN received cost), paid, outstanding
--
-- Debt accrues on GOODS RECEIVED (GRN), not on the PO: outstanding per
-- supplier = received cost - payments (credit notes reduce it).
-- RLS: staff SELECT only; writes via the service client (audit-logged).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SUPPLIER PAYMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id        uuid REFERENCES branches(id) ON DELETE SET NULL,
  supplier_id      uuid NOT NULL REFERENCES pharmacy_suppliers(id) ON DELETE RESTRICT,
  po_id            uuid REFERENCES pharmacy_purchase_orders(id) ON DELETE SET NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  method           text NOT NULL DEFAULT 'bank_transfer'
                   CHECK (method IN ('bank_transfer','cash','pos','credit_note')),
  bank_account_id  uuid REFERENCES hospital_bank_accounts(id) ON DELETE SET NULL,
  reference        text,
  notes            text,
  paid_at          date NOT NULL DEFAULT CURRENT_DATE,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant_date
  ON supplier_payments (tenant_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier
  ON supplier_payments (tenant_id, supplier_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_po
  ON supplier_payments (po_id);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'supplier_payments'
                    AND policyname = 'supplier_payments_staff_read') THEN
    CREATE POLICY supplier_payments_staff_read ON supplier_payments
      FOR SELECT TO authenticated
      USING ((tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. BANK LEDGER — accept supplier payments
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'hospital_bank_ledger'
                    AND column_name = 'supplier_payment_id') THEN
    ALTER TABLE hospital_bank_ledger
      ADD COLUMN supplier_payment_id uuid REFERENCES supplier_payments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- extend the source CHECK to include 'supplier_payment' (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hospital_bank_ledger_source_check'
       AND pg_get_constraintdef(oid) NOT LIKE '%supplier_payment%'
  ) THEN
    ALTER TABLE hospital_bank_ledger DROP CONSTRAINT hospital_bank_ledger_source_check;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hospital_bank_ledger_source_check'
       AND pg_get_constraintdef(oid) LIKE '%supplier_payment%'
  ) THEN
    ALTER TABLE hospital_bank_ledger
      ADD CONSTRAINT hospital_bank_ledger_source_check
      CHECK (source IN ('payment','other_income','expense','adjustment','supplier_payment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hospital_bank_ledger_supplier_payment
  ON hospital_bank_ledger (tenant_id, supplier_payment_id);

-- ---------------------------------------------------------------------------
-- 3. SUPPLIER BALANCES — bought vs paid vs outstanding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_supplier_balances(p_tenant_id uuid)
RETURNS TABLE (
  supplier_id      uuid,
  supplier_name    text,
  code             text,
  total_ordered    numeric,
  total_bought     numeric,
  total_paid       numeric,
  outstanding      numeric,
  po_count         bigint,
  payment_count    bigint,
  last_bought_at   timestamptz,
  last_paid_at     timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT s.id,
         s.name,
         s.code,
         COALESCE(po.total_ordered, 0)::numeric,
         COALESCE(grn.total_bought, 0)::numeric,
         COALESCE(pay.total_paid, 0)::numeric,
         (COALESCE(grn.total_bought, 0) - COALESCE(pay.total_paid, 0))::numeric,
         COALESCE(po.po_count, 0),
         COALESCE(pay.payment_count, 0),
         grn.last_bought_at,
         pay.last_paid_at
    FROM pharmacy_suppliers s
    LEFT JOIN (
      SELECT po.supplier_id,
             SUM(po.total_cost)                AS total_ordered,
             COUNT(*)                          AS po_count
        FROM pharmacy_purchase_orders po
       WHERE po.tenant_id = p_tenant_id
         AND po.status <> 'cancelled'
       GROUP BY po.supplier_id
    ) po ON po.supplier_id = s.id
    LEFT JOIN (
      SELECT po.supplier_id,
             SUM(gi.quantity_received * gi.unit_cost) AS total_bought,
             MAX(grn.received_at)                     AS last_bought_at
        FROM pharmacy_grn_items gi
        JOIN pharmacy_goods_received_notes grn ON grn.id = gi.grn_id
        JOIN pharmacy_purchase_orders po      ON po.id = gi.purchase_order_id
       WHERE grn.tenant_id = p_tenant_id
       GROUP BY po.supplier_id
    ) grn ON grn.supplier_id = s.id
    LEFT JOIN (
      SELECT sp.supplier_id,
             SUM(sp.amount) AS total_paid,
             COUNT(*)       AS payment_count,
             MAX(sp.created_at) AS last_paid_at
        FROM supplier_payments sp
       WHERE sp.tenant_id = p_tenant_id
       GROUP BY sp.supplier_id
    ) pay ON pay.supplier_id = s.id
   WHERE s.tenant_id = p_tenant_id
   ORDER BY (COALESCE(grn.total_bought, 0) - COALESCE(pay.total_paid, 0)) DESC, s.name;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_supplier_balances(uuid) TO authenticated;
