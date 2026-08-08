-- ============================================================================
-- SKYCARE â€” MIGRATION 0041: PHARMACY BILLING & REVENUE ENGINE
--
-- Sales ledger, multi-method payments (cash/POS/transfer/insurance splits),
-- NHIS/HMO insurance claims with formulary-based coverage & co-pay rules,
-- central-billing ledger sync and daily sales reporting.
--
--   pharmacy_invoices            sales header (patient- or counter-sale)
--   pharmacy_invoice_items        sold lines w/ unit price + batch ref
--   pharmacy_payments             one row per method per payment event
--   insurance_coverage            formulary: provider x drug coverage + co-pay
--   insurance_claims              claim lifecycle (draft -> pending -> approved)
--
-- Functions:
--   effective_drug_price(tenant, drug, branch)          pricing helper
--   pharmacy_invoice_create(tenant, branch, patient, ...) -> invoice uuid
--   pharmacy_invoice_pay(tenant, invoice, payments, user)  -> payment uuids
--   pharmacy_claim_create(tenant, invoice, provider, ...)  -> claim uuid
--   pharmacy_claim_process(tenant, claim, status, ...)     -> claim uuid
--   pharmacy_daily_sales(tenant, date, branch)            -> sales report row
--
-- RLS: SELECT for staff (reads); writes remain service-client only (API layer
-- audit-logs every write; DB triggers deliberately not added on these tables).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pharmacy_invoice_status') THEN
    CREATE TYPE public.pharmacy_invoice_status AS ENUM
      ('unpaid','partial','paid','cancelled','refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pharmacy_payment_method') THEN
    CREATE TYPE public.pharmacy_payment_method AS ENUM
      ('cash','pos','transfer','card','insurance');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pharmacy_claim_status') THEN
    CREATE TYPE public.pharmacy_claim_status AS ENUM
      ('draft','pending','approved','rejected','paid');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. PHARMACY INVOICES (sales ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id           uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id          uuid REFERENCES patients(id) ON DELETE SET NULL,
  visit_id            uuid REFERENCES visits(id) ON DELETE SET NULL,
  prescription_id     uuid,
  invoice_number      text NOT NULL,
  source              text NOT NULL DEFAULT 'counter'
                      CHECK (source IN ('counter','prescription','ward')),
  subtotal            numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount        numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount         numeric(12,2) NOT NULL DEFAULT 0,
  status              public.pharmacy_invoice_status NOT NULL DEFAULT 'unpaid',
  insurance_claimable boolean NOT NULL DEFAULT false,
  notes               text,
  synced_invoice_id   uuid,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz,
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS pharmacy_invoice_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES pharmacy_invoices(id) ON DELETE CASCADE,
  drug_id       uuid REFERENCES pharmacy_drugs(id) ON DELETE SET NULL,
  drug_name     text NOT NULL,
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price   numeric(12,2) NOT NULL CHECK (total_price >= 0),
  batch_id      uuid REFERENCES pharmacy_stock_batches(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoice_items_invoice ON pharmacy_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoices_tenant_date ON pharmacy_invoices (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoices_patient ON pharmacy_invoices (patient_id);

-- ---------------------------------------------------------------------------
-- 2. PHARMACY PAYMENTS â€” one row per payment method (split payments allowed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id        uuid REFERENCES branches(id) ON DELETE SET NULL,
  invoice_id       uuid NOT NULL REFERENCES pharmacy_invoices(id) ON DELETE CASCADE,
  patient_id       uuid REFERENCES patients(id) ON DELETE SET NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  method           public.pharmacy_payment_method NOT NULL DEFAULT 'cash',
  reference        text,
  status           text NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('pending','completed','refunded')),
  received_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
notes            text,
  synced_payment_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_payments_reference
  ON pharmacy_payments (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_payments_invoice ON pharmacy_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_payments_tenant_date ON pharmacy_payments (tenant_id, received_at);

-- ---------------------------------------------------------------------------
-- 3. INSURANCE FORMULARY â€” provider x drug coverage + co-pay rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_coverage (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_name      text NOT NULL,
  drug_id            uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE CASCADE,
  is_covered         boolean NOT NULL DEFAULT true,
  co_pay_type        text NOT NULL DEFAULT 'percent'
                     CHECK (co_pay_type IN ('percent','fixed','none')),
  co_pay_value       numeric(12,2) NOT NULL DEFAULT 0
                     CHECK (co_pay_value >= 0),
  max_qty_per_claim  integer CHECK (max_qty_per_claim IS NULL OR max_qty_per_claim > 0),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_name, drug_id)
);
CREATE INDEX IF NOT EXISTS idx_insurance_coverage_provider ON insurance_coverage (tenant_id, provider_name);

-- ---------------------------------------------------------------------------
-- 4. INSURANCE CLAIMS (NHIS / HMO) â€” full lifecycle
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES pharmacy_invoices(id) ON DELETE CASCADE,
  patient_id       uuid REFERENCES patients(id) ON DELETE SET NULL,
  provider_name    text NOT NULL,
  policy_number    text,
  claim_number     text NOT NULL,
  claim_amount     numeric(12,2) NOT NULL DEFAULT 0,
  co_pay_amount    numeric(12,2) NOT NULL DEFAULT 0,
  approved_amount  numeric(12,2) CHECK (approved_amount IS NULL OR approved_amount >= 0),
  status           public.pharmacy_claim_status NOT NULL DEFAULT 'draft',
  submitted_at     timestamptz,
  processed_at     timestamptz,
  processed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_invoice ON insurance_claims (invoice_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 5. RLS â€” reads for staff on all five; writes remain service-client only.
--    (Admin read policies mirror the established pharmacy pattern.)
-- ---------------------------------------------------------------------------
ALTER TABLE pharmacy_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pharmacy_invoices','pharmacy_invoice_items','pharmacy_payments',
    'insurance_coverage','insurance_claims']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = t AND policyname = 'pharmacy_billing_staff_read') THEN
      EXECUTE format(
'CREATE POLICY pharmacy_billing_staff_read ON %I FOR SELECT TO authenticated
         USING ((auth.jwt() ->> ''role'') IN
           (''hospital_admin'', ''pharmacist'', ''cashier'', ''doctor'', ''nurse'', ''super_admin''))',
        t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. PRICE LOOKUP â€” override ?? unit retail ?? wholesale
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION effective_drug_price(
  p_tenant_id uuid, p_drug_id uuid, p_branch_id uuid
) RETURNS numeric(12,2)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT unit_price FROM pharmacy_price_overrides
      WHERE tenant_id = p_tenant_id AND drug_id = p_drug_id
        AND (branch_id IS NULL OR branch_id = p_branch_id)
      ORDER BY (branch_id IS NOT NULL) DESC
      LIMIT 1),
    (SELECT unit_price FROM pharmacy_drugs
      WHERE id = p_drug_id AND tenant_id = p_tenant_id),
    (SELECT wholesale_price FROM pharmacy_drugs
      WHERE id = p_drug_id AND tenant_id = p_tenant_id),
    0::numeric(12,2)
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. CREATE INVOICE â€” single transaction, derived totals.
--    p_items = [{drug_id, quantity, unit_price?, batch_id?}]
--    unit_price NULL -> effective_drug_price()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_invoice_create(
  p_tenant_id      uuid,
  p_branch_id      uuid,
  p_patient_id     uuid,
  p_visit_id       uuid,
  p_source         text DEFAULT 'counter',
  p_items          jsonb DEFAULT NULL,
  p_discount       numeric DEFAULT 0,
  p_tax_rate       numeric DEFAULT 0,
  p_prescription_id uuid DEFAULT NULL,
  p_claimable      boolean DEFAULT false,
  p_notes          text DEFAULT NULL,
  p_created_by     uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_item        jsonb;
  v_drug_id     uuid;
  v_drug_name   text;
  v_qty         integer;
  v_price       numeric(12,2);
  v_line        numeric(12,2);
  v_subtotal    numeric(12,2) := 0;
  v_tax_amount  numeric(12,2) := 0;
  v_total       numeric(12,2);
  v_seq         integer;
  v_num         text;
  v_invoice     uuid;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no items supplied for invoice';
  END IF;
  IF p_source NOT IN ('counter','prescription','ward') THEN
    RAISE EXCEPTION 'invalid invoice source %', p_source;
  END IF;

  SELECT COALESCE(MAX(CAST(substr(invoice_number, 10) AS integer)), 0) + 1 INTO v_seq
    FROM pharmacy_invoices
   WHERE tenant_id = p_tenant_id
     AND invoice_number LIKE 'PHX-' || to_char(now(), 'YYYY') || '-%';
  IF v_seq IS NULL THEN v_seq := 1; END IF;
  v_num := 'PHX-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO pharmacy_invoices
    (tenant_id, branch_id, patient_id, visit_id, prescription_id, source,
     invoice_number, discount_amount, tax_amount, insurance_claimable, notes, created_by)
  VALUES (p_tenant_id, p_branch_id, p_patient_id, p_visit_id, p_prescription_id, p_source,
          v_num, COALESCE(p_discount, 0), 0, COALESCE(p_claimable, false),
          p_notes, p_created_by)
  RETURNING id INTO v_invoice;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS j(item)
  LOOP
    v_drug_id := NULLIF(v_item->>'drug_id', '')::uuid;
    IF v_drug_id IS NULL OR NOT EXISTS
       (SELECT 1 FROM pharmacy_drugs WHERE id = v_drug_id AND tenant_id = p_tenant_id) THEN
      RAISE EXCEPTION 'invalid drug_id (%) in invoice items', v_item->>'drug_id';
    END IF;
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'quantity must be positive for drug %', v_drug_id;
    END IF;
    IF (v_item->>'unit_price') IS NOT NULL THEN
      v_price := GREATEST((v_item->>'unit_price')::numeric, 0);
    ELSE
      v_price := effective_drug_price(p_tenant_id, v_drug_id, p_branch_id);
    END IF;

    SELECT name INTO v_drug_name FROM pharmacy_drugs WHERE id = v_drug_id;
    v_line := ROUND(v_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line;

    INSERT INTO pharmacy_invoice_items
      (invoice_id, drug_id, drug_name, quantity, unit_price, total_price, batch_id)
    VALUES (v_invoice, v_drug_id, v_drug_name, v_qty, v_price, v_line,
            NULLIF(v_item->>'batch_id', '')::uuid);
  END LOOP;

  v_tax_amount := ROUND(v_subtotal * COALESCE(p_tax_rate, 0) / 100.0, 2);
  v_total := ROUND(v_subtotal - COALESCE(p_discount, 0) + v_tax_amount, 2);
  IF v_total < 0 THEN v_total := 0; END IF;

  UPDATE pharmacy_invoices
     SET subtotal = v_subtotal, tax_amount = v_tax_amount, total_amount = v_total,
         updated_at = now()
   WHERE id = v_invoice;

  RETURN v_invoice;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. RECORD PAYMENT(S) â€” one or more methods in a single call (split payments)
--    p_payments = [{method, amount, reference?}]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_invoice_pay(
  p_tenant_id   uuid,
  p_invoice_id  uuid,
  p_payments    jsonb,
  p_user_id     uuid,
  p_branch_id   uuid DEFAULT NULL
) RETURNS uuid[]
LANGUAGE plpgsql AS $$
DECLARE
  v_invoice      record;
  v_outstanding  numeric(12,2);
  v_pay          jsonb;
  v_amount       numeric(12,2);
  v_method       text;
  v_payment      uuid;
  v_paid_total   numeric(12,2);
  v_ids          uuid[] := '{}';
BEGIN
  SELECT * INTO v_invoice FROM pharmacy_invoices
   WHERE id = p_invoice_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF v_invoice.status IN ('cancelled','refunded') THEN
    RAISE EXCEPTION 'cannot pay a % invoice', v_invoice.status;
  END IF;

  v_paid_total := v_invoice.paid_amount;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments) AS j(item)
  LOOP
    v_method := v_pay->>'method';
    IF v_method IS NULL OR v_method NOT IN ('cash','pos','transfer','card','insurance') THEN
      RAISE EXCEPTION 'invalid payment method %', v_method;
    END IF;
    v_amount := COALESCE((v_pay->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'payment amount must be positive';
    END IF;
    IF v_paid_total + v_amount > v_invoice.total_amount + 0.01 THEN
      RAISE EXCEPTION 'payment of % exceeds the outstanding balance (%)',
        v_amount, (v_invoice.total_amount - v_paid_total);
    END IF;

INSERT INTO pharmacy_payments
      (tenant_id, branch_id, invoice_id, patient_id, amount, method, reference,
       received_by, received_at, notes)
    VALUES (p_tenant_id, p_branch_id, v_invoice.id, v_invoice.patient_id,
            v_amount, v_method::pharmacy_payment_method, NULLIF(v_pay->>'reference',''),
            p_user_id, now(), NULLIF(v_pay->>'notes',''))
    RETURNING id INTO v_payment;

    v_paid_total := v_paid_total + v_amount;
    v_ids := array_append(v_ids, v_payment);

    UPDATE pharmacy_invoices
       SET paid_amount = v_paid_total,
           status = CASE WHEN v_paid_total >= v_invoice.total_amount - 0.01
                          THEN 'paid'::pharmacy_invoice_status
                          ELSE 'partial'::pharmacy_invoice_status END,
           paid_at = CASE WHEN v_paid_total >= v_invoice.total_amount - 0.01
                          THEN now() ELSE paid_at END,
           updated_at = now()
     WHERE id = v_invoice.id;
  END LOOP;

  RETURN v_ids;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. CREATE CLAIM â€” formulary coverage check + co-pay rules per line.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_claim_create(
  p_tenant_id      uuid,
  p_invoice_id     uuid,
  p_provider_name  text,
  p_policy_number  text DEFAULT NULL,
  p_created_by     uuid DEFAULT NULL,
  p_claim_mode     text DEFAULT 'auto'   -- auto -> submitted; manual -> draft
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
v_invoice record;
  v_item    record;
  v_cov     record;
  v_copay   numeric(12,2) := 0;
  v_claim_value numeric(12,2) := 0;
  v_seq     integer;
  v_claim_no text;
  v_claim_id  uuid;
BEGIN
  SELECT * INTO v_invoice FROM pharmacy_invoices
   WHERE id = p_invoice_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF p_provider_name IS NULL OR btrim(p_provider_name) = '' THEN
    RAISE EXCEPTION 'provider name is required';
  END IF;

  IF EXISTS (SELECT 1 FROM insurance_claims
              WHERE invoice_id = p_invoice_id AND provider_name = p_provider_name
                AND status IN ('draft','pending','approved','paid')) THEN
    RAISE EXCEPTION 'a claim for this invoice/provider already exists';
  END IF;

  SELECT COALESCE(MAX(CAST(substr(claim_number, 5) AS integer)), 0) + 1 INTO v_seq
    FROM insurance_claims
   WHERE tenant_id = p_tenant_id AND claim_number LIKE 'CLM-%';
  IF v_seq IS NULL THEN v_seq := 1; END IF;
  v_claim_no := 'CLM-' || lpad(v_seq::text, 5, '0');

  -- per-line coverage + co-pay; uncovered lines excluded from the claim
  FOR v_item IN SELECT ii.id, ii.drug_id, ii.quantity, ii.total_price
                  FROM pharmacy_invoice_items ii
                 WHERE ii.invoice_id = p_invoice_id
  LOOP
    SELECT * INTO v_cov FROM insurance_coverage
     WHERE tenant_id = p_tenant_id AND provider_name = p_provider_name
       AND drug_id = v_item.drug_id;

    IF v_cov.id IS NULL OR v_cov.is_covered THEN
      IF v_cov.id IS NOT NULL AND v_cov.co_pay_type = 'percent' THEN
        v_copay := v_copay + ROUND(v_item.total_price * v_cov.co_pay_value / 100.0, 2);
      ELSIF v_cov.id IS NOT NULL AND v_cov.co_pay_type = 'fixed' THEN
        v_copay := v_copay + ROUND(v_cov.co_pay_value * v_item.quantity, 2);
      END IF;
v_claim_value := v_claim_value + v_item.total_price;
    END IF;
  END LOOP;

  v_claim_value := ROUND(v_claim_value - v_copay, 2);
  IF v_claim_value <= 0 THEN
    RAISE EXCEPTION 'no covered items on this invoice for %', p_provider_name;
  END IF;

  INSERT INTO insurance_claims
    (tenant_id, invoice_id, patient_id, provider_name, policy_number, claim_number,
     claim_amount, co_pay_amount, status, submitted_at, created_by)
  VALUES (p_tenant_id, p_invoice_id, v_invoice.patient_id, p_provider_name,
          NULLIF(p_policy_number,''), v_claim_no, v_claim_value, v_copay,
          CASE WHEN p_claim_mode = 'auto' THEN 'pending'::pharmacy_claim_status
               ELSE 'draft'::pharmacy_claim_status END,
          CASE WHEN p_claim_mode = 'auto' THEN now() ELSE NULL END,
          p_created_by)
  RETURNING id INTO v_claim_id;

  UPDATE pharmacy_invoices SET insurance_claimable = true
   WHERE id = p_invoice_id;

  RETURN v_claim_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. PROCESS CLAIM â€” approve (record insurance payment) or reject.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_claim_process(
  p_tenant_id  uuid,
  p_claim_id   uuid,
  p_status     text,          -- approved | rejected
  p_amount     numeric DEFAULT NULL,   -- approved amount (defaults to claim_amount)
  p_user_id    uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_claim record;
  v_approved numeric(12,2);
  v_pay  uuid[];
BEGIN
  SELECT * INTO v_claim FROM insurance_claims
   WHERE id = p_claim_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'claim not found'; END IF;
  IF v_claim.status NOT IN ('pending','draft') THEN
    RAISE EXCEPTION 'claim is already %', v_claim.status;
  END IF;

IF p_status = 'approved' OR p_status = 'paid' THEN
    v_approved := COALESCE(p_amount, v_claim.claim_amount);
    IF v_approved <= 0 THEN
      RAISE EXCEPTION 'approved amount must be positive';
    END IF;
    -- record the insurer's payment against the invoice so the ledger is whole;
    -- if the invoice is already fully paid (insurer settled at the counter),
    -- approving the claim just confirms it without double-charging.
    IF (SELECT total_amount - paid_amount FROM pharmacy_invoices WHERE id = v_claim.invoice_id) > 0.01 THEN
      SELECT pharmacy_invoice_pay(p_tenant_id, v_claim.invoice_id,
               jsonb_build_array(jsonb_build_object(
                 'method','insurance',
                 'amount', v_approved,
                 'reference','CLM-' || v_claim.claim_number,
                 'notes','Insurance payout ' || v_claim.provider_name)),
               p_user_id) INTO v_pay;
    END IF;

    UPDATE insurance_claims
       SET status = CASE WHEN p_status = 'paid' THEN 'paid'::pharmacy_claim_status
                         ELSE 'approved'::pharmacy_claim_status END,
           approved_amount = v_approved, processed_at = now(),
           processed_by = p_user_id, updated_at = now()
     WHERE id = p_claim_id;
    RETURN p_claim_id;
  END IF;

  IF p_status = 'rejected' THEN
    UPDATE insurance_claims
       SET status = 'rejected'::pharmacy_claim_status, processed_at = now(),
           processed_by = p_user_id, approved_amount = 0,
           updated_at = now()
     WHERE id = p_claim_id;
    RETURN p_claim_id;
  END IF;

  RAISE EXCEPTION 'invalid claim status %', p_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. DAILY SALES REPORT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_daily_sales(
  p_tenant_id  uuid,
  p_sales_date date DEFAULT CURRENT_DATE,
  p_branch_id  uuid DEFAULT NULL
) RETURNS TABLE (
  date          date,
  total_sales   numeric(12,2),
  cash          numeric(12,2),
  pos           numeric(12,2),
  transfer      numeric(12,2),
  card          numeric(12,2),
  insurance     numeric(12,2),
  invoice_count bigint,
  item_count    bigint,
  outstanding   numeric(12,2),
  top_drugs     jsonb
) LANGUAGE sql STABLE AS $$
  WITH pay AS (
    SELECT method::text AS m, COALESCE(SUM(amount),0)::numeric(12,2) AS s
      FROM pharmacy_payments
     WHERE tenant_id = p_tenant_id
       AND received_at::date = p_sales_date
       AND (p_branch_id IS NULL OR branch_id = p_branch_id)
       AND status = 'completed'
     GROUP BY 1
  ),
  inv AS (
    SELECT COALESCE(SUM(total_amount - paid_amount),0)::numeric(12,2) AS outstanding,
           COUNT(*) FILTER (WHERE created_at::date = p_sales_date
                             AND status NOT IN ('cancelled','refunded')) AS invoices_today,
           COUNT(*) FILTER (WHERE status NOT IN ('cancelled','refunded')) AS inv_all
      FROM pharmacy_invoices
     WHERE tenant_id = p_tenant_id
       AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ),
  topd AS (
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.qty DESC), '[]'::jsonb) AS agg
      FROM (SELECT ii.drug_name AS name, SUM(ii.quantity) AS qty
              FROM pharmacy_invoice_items ii
              JOIN pharmacy_invoices i ON i.id = ii.invoice_id
             WHERE i.tenant_id = p_tenant_id
               AND i.created_at::date = p_sales_date
               AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
               AND i.status NOT IN ('cancelled','refunded')
             GROUP BY ii.drug_name
             ORDER BY qty DESC
             LIMIT 5) t
  )
  SELECT p_sales_date::date,
         COALESCE((SELECT SUM(amount)::numeric(12,2) FROM pharmacy_payments
                    WHERE tenant_id = p_tenant_id AND received_at::date = p_sales_date
                      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
                      AND status = 'completed'), 0),
         COALESCE((SELECT s FROM pay WHERE m = 'cash'), 0),
         COALESCE((SELECT s FROM pay WHERE m = 'pos'), 0),
         COALESCE((SELECT s FROM pay WHERE m = 'transfer'), 0),
         COALESCE((SELECT s FROM pay WHERE m = 'card'), 0),
         COALESCE((SELECT s FROM pay WHERE m = 'insurance'), 0),
         (SELECT invoices_today FROM inv),
         COALESCE((SELECT COUNT(ii.id)::bigint FROM pharmacy_invoice_items ii
                    JOIN pharmacy_invoices i ON i.id = ii.invoice_id
                   WHERE i.tenant_id = p_tenant_id
                     AND i.created_at::date = p_sales_date
                     AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
                     AND i.status NOT IN ('cancelled','refunded')), 0),
         (SELECT outstanding FROM inv),
         (SELECT agg FROM topd);
$$;

GRANT EXECUTE ON FUNCTION effective_drug_price(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_invoice_create(uuid, uuid, uuid, uuid, text, jsonb, numeric, numeric, uuid, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_invoice_pay(uuid, uuid, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_claim_create(uuid, uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_claim_process(uuid, uuid, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_daily_sales(uuid, date, uuid) TO authenticated;
