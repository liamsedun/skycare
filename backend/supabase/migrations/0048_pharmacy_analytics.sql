-- ============================================================================
-- 0048 — PHARMACY ANALYTICS ENGINE
-- Sales ranking, profit margins, monthly financials, wastage tracking and a
-- single-call dashboard bundle. Adds:
--   * inventory_losses (expired | damaged | theft | other) + cost impact
--   * pharmacy_record_loss: debits the batch ledger (movement type 'loss'),
--     computes cost impact from batch cost price, writes the loss row and the
--     compliance audit chain (fn_pharmacy_compliance_movement maps non-
--     in/transfer_in/adjust movements to the audit log automatically)
--   * 5 analytics RPCs + performance indexes
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. INVENTORY LOSSES — wastage/loss ledger (append-only facts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_losses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id),
  branch_id    uuid,
  drug_id      uuid NOT NULL REFERENCES public.pharmacy_drugs(id),
  batch_id     uuid REFERENCES public.pharmacy_stock_batches(id),
  quantity     integer NOT NULL CHECK (quantity > 0),
  reason       text NOT NULL CHECK (reason IN ('expired','damaged','theft','other')),
  notes        text,
  cost_impact  numeric(12,2) NOT NULL DEFAULT 0,
  recorded_by  uuid REFERENCES public.users(id),
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_losses_tenant_date
  ON public.inventory_losses (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_losses_drug
  ON public.inventory_losses (drug_id, reason);

ALTER TABLE public.inventory_losses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_losses_staff_read ON public.inventory_losses;
CREATE POLICY pharmacy_losses_staff_read ON public.inventory_losses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() AND u.tenant_id = inventory_losses.tenant_id)
  );

GRANT SELECT ON public.inventory_losses TO authenticated;

-- Extend the movement type vocabulary with 'loss' (write-off), keeping the
-- wallet of the apply-movement trigger intact (any type other than
-- in/transfer_in/adjust is a debit in fn_pharmacy_apply_movement).
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS pharmacy_stock_movements_type_check;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT pharmacy_stock_movements_type_check
  CHECK (type = ANY (ARRAY['in','out','adjust','transfer_in','transfer_out','dispense','waste','loss']));

-- ---------------------------------------------------------------------------
-- 1b. COMPLIANCE TRIGGER PATCH — type 'loss' must audit as 'loss' (not
-- 'dispense') and must debit the controlled-drug register so the ledger
-- stays truthful when controlled stock is written off.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pharmacy_compliance_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_drug        record;
  v_balance     integer;
  v_patient     uuid;
  v_prescriber  text;
  v_rx_id       uuid;
  v_rx_patient  uuid;
  v_remaining   integer;
  v_drug_result record;
  v_qty_check   integer;
  v_is_loss     boolean := COALESCE(NEW.type = 'loss', false);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id, name, is_controlled, max_qty_per_dispense
    INTO STRICT v_drug
    FROM public.pharmacy_drugs WHERE id = NEW.drug_id;

  -- Resolve prescription context (if a reference is present). Text compare
  -- avoids a hard cast error when source_ref is a non-prescription id.
  IF NEW.type = 'dispense' AND NEW.source_ref IS NOT NULL THEN
    SELECT p.id, p.patient_id, u.full_name
      INTO v_rx_id, v_rx_patient, v_prescriber
      FROM public.prescriptions p
      LEFT JOIN public.users u ON u.id = p.doctor_id
     WHERE p.id::text = NEW.source_ref;
    IF v_rx_id IS NOT NULL THEN
      v_patient := v_rx_patient;
    END IF;
  END IF;

  -- ---- Controlled drug rules --------------------------------------------
  IF v_drug.is_controlled THEN
    -- No dispensing without a prescription (regardless of route)
    IF NEW.type IN ('dispense') AND v_rx_id IS NULL THEN
      RAISE EXCEPTION 'Controlled drug % cannot be dispensed without a prescription (source_ref = prescription id)', v_drug.name;
    END IF;
    -- Enforce the per-dispensing cap (NAFDAC/NDLEA limits)
    IF NEW.type = 'dispense' AND COALESCE(v_drug.max_qty_per_dispense, 0) > 0
       AND NEW.quantity > v_drug.max_qty_per_dispense THEN
      RAISE EXCEPTION 'Dispensing % units of controlled drug % exceeds its cap of %', NEW.quantity, v_drug.name, v_drug.max_qty_per_dispense;
    END IF;

    -- Running balance from the ledger
    SELECT COALESCE(
             (SELECT balance_after FROM public.controlled_drug_register
               WHERE drug_id = NEW.drug_id AND tenant_id = NEW.tenant_id
               ORDER BY created_at DESC, id DESC LIMIT 1), 0)
      INTO v_balance;

    IF NEW.type IN ('in','transfer_in') THEN
      v_balance := v_balance + NEW.quantity;
      INSERT INTO public.controlled_drug_register
        (tenant_id, drug_id, prescription_id, quantity_received, balance_after,
         source_supplier, pharmacist_id, notes, branch_id, created_at)
      VALUES (NEW.tenant_id, NEW.drug_id, NULL, NEW.quantity, v_balance,
              NEW.notes, COALESCE(NEW.created_by, auth.uid()),
              'Received ' || NEW.quantity || ' units', NEW.branch_id, now());
    ELSIF NEW.type IN ('dispense','transfer_out','loss') THEN
      v_balance := GREATEST(v_balance - NEW.quantity, 0);
      INSERT INTO public.controlled_drug_register
        (tenant_id, drug_id, patient_id, prescription_id, quantity_dispensed,
         balance_after, prescriber_name, pharmacist_id, notes, branch_id, created_at)
      VALUES (NEW.tenant_id, NEW.drug_id, v_patient, v_rx_id, NEW.quantity,
              v_balance, v_prescriber, COALESCE(NEW.created_by, auth.uid()),
              CASE WHEN v_is_loss THEN 'Loss written off: ' || COALESCE(NEW.notes, '')
                   ELSE 'Dispensed ' || NEW.quantity || ' units' END,
              NEW.branch_id, now());
    END IF;
  END IF;

  -- ---- Audit row for EVERY movement --------------------------------------
  INSERT INTO public.dispensing_audit_logs
    (tenant_id, user_id, action, drug_id, drug_name, batch_id, branch_id,
     patient_id, prescription_id, quantity, notes, created_at)
  VALUES (NEW.tenant_id, COALESCE(NEW.created_by, auth.uid()),
          CASE WHEN NEW.type IN ('in','transfer_in') THEN 'in'
               WHEN NEW.type = 'adjust' THEN 'adjust'
               WHEN NEW.type = 'loss' THEN 'loss'
               ELSE 'dispense' END,
          NEW.drug_id, v_drug.name, NEW.batch_id, NEW.branch_id,
          v_patient, v_rx_id, NEW.quantity, NEW.notes, now());

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Record a stock loss: debits the batch via movement type 'loss' (a debit in
-- fn_pharmacy_apply_movement's generic branch), computes cost impact from the
-- batch cost price, writes the inventory_losses row and the audit chain.
CREATE OR REPLACE FUNCTION public.pharmacy_record_loss(
  p_tenant uuid, p_drug uuid, p_qty integer, p_reason text,
  p_branch text DEFAULT NULL, p_batch uuid DEFAULT NULL,
  p_notes text DEFAULT NULL, p_by uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_batch uuid;
  v_cost  numeric(12,2);
  v_loss  uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;
  IF p_reason NOT IN ('expired','damaged','theft','other') THEN
    RAISE EXCEPTION 'invalid loss reason % (expected expired|damaged|theft|other)', p_reason;
  END IF;

  IF p_batch IS NOT NULL THEN
    SELECT b.id INTO v_batch
      FROM public.pharmacy_stock_batches b
     WHERE b.id = p_batch AND b.tenant_id = p_tenant AND b.drug_id = p_drug;
    IF v_batch IS NULL THEN
      RAISE EXCEPTION 'batch % does not belong to drug in this tenant', p_batch;
    END IF;
  ELSE
    SELECT b.id INTO v_batch
      FROM public.pharmacy_stock_batches b
     WHERE b.tenant_id = p_tenant AND b.drug_id = p_drug
       AND b.quantity_on_hand > 0
     ORDER BY b.expiry_date ASC NULLS LAST, b.created_at ASC
     LIMIT 1;
    IF v_batch IS NULL THEN
      RAISE EXCEPTION 'no stock available to write off for drug %', p_drug;
    END IF;
  END IF;

  SELECT COALESCE(b.cost_price, 0) INTO v_cost
    FROM public.pharmacy_stock_batches b WHERE b.id = v_batch;

  INSERT INTO public.pharmacy_stock_movements
    (tenant_id, drug_id, batch_id, branch_id, type, quantity,
     source_ref, notes, created_by)
  VALUES (p_tenant, p_drug, v_batch, NULLIF(p_branch, '')::uuid,
          'loss', p_qty, 'inventory_loss', COALESCE(p_notes, p_reason), p_by);

  INSERT INTO public.inventory_losses
    (tenant_id, branch_id, batch_id, drug_id, quantity, reason, notes,
     cost_impact, recorded_by)
  VALUES (p_tenant, NULLIF(p_branch, '')::uuid, v_batch, p_drug, p_qty,
          p_reason, p_notes, ROUND(v_cost * p_qty, 2), p_by)
  RETURNING id INTO v_loss;

  RETURN v_loss;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_record_loss(uuid, uuid, integer, text, text, uuid, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Performance: index the analytics hot paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoices_tenant_created
  ON public.pharmacy_invoices (tenant_id, created_at DESC)
  WHERE status NOT IN ('cancelled','refunded');
CREATE INDEX IF NOT EXISTS idx_pharmacy_invoice_items_invoice
  ON public.pharmacy_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_payments_tenant_received
  ON public.pharmacy_payments (tenant_id, received_at DESC, status);

-- ---------------------------------------------------------------------------
-- 2. TOP-SELLING DRUGS — ranking by revenue + units for a range
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_top_drugs(
  p_tenant_id uuid, p_from date, p_to date,
  p_branch uuid DEFAULT NULL, p_limit integer DEFAULT 10)
RETURNS TABLE (
  drug_id uuid, drug_name text, category text, qty integer,
  revenue numeric, share numeric
)
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
    WITH sales AS (
      SELECT ii.drug_id, MAX(d.name)::text AS name, MAX(d.category)::text AS category,
             SUM(ii.quantity)::numeric(14,2) AS qty,
             SUM(ii.total_price)::numeric(14,2) AS revenue
        FROM public.pharmacy_invoice_items ii
        JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
        JOIN public.pharmacy_drugs d ON d.id = ii.drug_id
       WHERE i.tenant_id = p_tenant_id
         AND i.status NOT IN ('cancelled','refunded')
         AND i.created_at >= p_from::timestamptz
         AND i.created_at < (p_to + interval '1 day')::timestamptz
         AND (p_branch IS NULL OR i.branch_id = p_branch)
       GROUP BY ii.drug_id
    )
    SELECT s.drug_id, s.name, s.category,
           ROUND(s.qty)::integer, s.revenue,
           ROUND(100.0 * s.revenue / NULLIF(SUM(s.revenue) OVER (), 0), 2)
      FROM sales s
     ORDER BY s.revenue DESC
     LIMIT GREATEST(1, p_limit);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_top_drugs(uuid, date, date, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. PROFIT MARGINS — revenue vs procured cost, per drug
-- (cost falls back to wholesale_price when the invoice item has no batch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_profit_margins(
  p_tenant_id uuid, p_from date, p_to date, p_branch uuid DEFAULT NULL)
RETURNS TABLE (
  drug_id uuid, drug_name text, revenue numeric(14,2), cost numeric(14,2),
  profit numeric(14,2), margin_pct numeric, qty bigint, avg_unit_price numeric
)
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
    SELECT ii.drug_id,
           MAX(d.name)::text,
           SUM(ii.total_price)::numeric(14,2) AS revenue,
           SUM(ii.quantity * COALESCE(b.cost_price, d.wholesale_price, 0))::numeric(14,2) AS cost,
           (SUM(ii.total_price) - SUM(ii.quantity * COALESCE(b.cost_price, d.wholesale_price, 0)))::numeric(14,2) AS profit,
           ROUND(100.0 * (SUM(ii.total_price)
                     - SUM(ii.quantity * COALESCE(b.cost_price, d.wholesale_price, 0)))
                 / NULLIF(SUM(ii.total_price), 0), 4) AS margin_pct,
           SUM(ii.quantity) AS qty,
           ROUND(AVG(ii.unit_price), 4) AS avg_unit_price
      FROM public.pharmacy_invoice_items ii
      JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
      JOIN public.pharmacy_drugs d ON d.id = ii.drug_id
      LEFT JOIN public.pharmacy_stock_batches b ON b.id = ii.batch_id
     WHERE i.tenant_id = p_tenant_id
       AND i.status NOT IN ('cancelled','refunded')
       AND i.created_at >= p_from::timestamptz
       AND i.created_at < (p_to + interval '1 day')::timestamptz
       AND (p_branch IS NULL OR i.branch_id = p_branch)
     GROUP BY ii.drug_id
     ORDER BY profit DESC
     LIMIT 200;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_profit_margins(uuid, date, date, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. MONTHLY FINANCIALS — revenue/cost/profit + payment-method split
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_monthly_financials(
  p_tenant_id uuid, p_months integer DEFAULT 12, p_branch uuid DEFAULT NULL)
RETURNS TABLE (
  month text, revenue numeric(14,2), cost numeric(14,2), profit numeric(14,2),
  invoice_count bigint, items_sold bigint,
  cash numeric(14,2), pos numeric(14,2), transfer numeric(14,2),
  card numeric(14,2), insurance numeric(14,2), refunds numeric(14,2)
)
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
    WITH months AS (
      SELECT to_char(generate_series(
               date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval,
               date_trunc('month', CURRENT_DATE), '1 month'), 'YYYY-MM') AS m
    ),
    sales AS (
      SELECT to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS m,
             i.id AS invoice_id, i.total_amount AS amount, i.status
        FROM public.pharmacy_invoices i
       WHERE i.tenant_id = p_tenant_id
         AND (p_branch IS NULL OR i.branch_id = p_branch)
    ),
    item_sum AS (
      SELECT to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS m,
             SUM(ii.quantity) AS qty,
             SUM(ii.total_price) AS rev,
             SUM(ii.quantity * COALESCE(b.cost_price, d.wholesale_price, 0)) AS cst
        FROM public.pharmacy_invoice_items ii
        JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
        JOIN public.pharmacy_drugs d ON d.id = ii.drug_id
        LEFT JOIN public.pharmacy_stock_batches b ON b.id = ii.batch_id
       WHERE i.tenant_id = p_tenant_id
         AND i.status NOT IN ('cancelled','refunded')
         AND (p_branch IS NULL OR i.branch_id = p_branch)
       GROUP BY 1
    ),
    pays AS (
      SELECT to_char(p.received_at AT TIME ZONE 'UTC', 'YYYY-MM') AS m,
             p.method::text AS method, p.amount
        FROM public.pharmacy_payments p
       WHERE p.tenant_id = p_tenant_id AND p.status = 'completed'
         AND (p_branch IS NULL OR p.branch_id = p_branch)
    )
    SELECT mo.m,
           COALESCE(it.rev, 0)::numeric(14,2),
           COALESCE(it.cst, 0)::numeric(14,2),
           (COALESCE(it.rev, 0) - COALESCE(it.cst, 0))::numeric(14,2),
           (SELECT COUNT(*) FROM sales s WHERE s.m = mo.m
              AND s.status NOT IN ('cancelled','refunded')),
           COALESCE(it.qty, 0),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'cash'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'pos'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'transfer'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'card'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'insurance'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(s.amount_total) FROM (SELECT i2.total_amount AS amount_total
                        FROM public.pharmacy_invoices i2
                       WHERE i2.tenant_id = p_tenant_id AND i2.status = 'refunded'
                         AND to_char(i2.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = mo.m
                         AND (p_branch IS NULL OR i2.branch_id = p_branch)) s), 0)::numeric(14,2)
      FROM months mo
      LEFT JOIN item_sum it ON it.m = mo.m
     ORDER BY mo.m;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. WASTAGE REPORT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_wastage_report(
  p_tenant_id uuid, p_from date, p_to date, p_branch uuid DEFAULT NULL)
RETURNS TABLE (
  drug_name text, reason text, qty integer, cost_impact numeric(14,2),
  recorded_at timestamptz
)
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
    SELECT d.name, l.reason, l.quantity, l.cost_impact, l.recorded_at
      FROM public.inventory_losses l
      JOIN public.pharmacy_drugs d ON d.id = l.drug_id
     WHERE l.tenant_id = p_tenant_id
       AND (p_branch IS NULL OR l.branch_id = p_branch)
       AND l.recorded_at >= p_from::timestamptz
       AND l.recorded_at < (p_to + interval '1 day')::timestamptz
     ORDER BY l.recorded_at DESC
     LIMIT 500;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. DASHBOARD — one-call snapshot (KPIs + top drugs + monthly + wastage)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_analytics_dashboard(
  p_tenant_id uuid, p_months integer DEFAULT 12, p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_top  jsonb;
  v_mon  jsonb;
  v_ws   jsonb;
  v_kpi  jsonb;
BEGIN
  SELECT jsonb_agg(t ORDER BY (t->>'revenue')::numeric DESC NULLS LAST)
    INTO v_top
    FROM (SELECT jsonb_build_object(
                 'drug_id', ii.drug_id, 'drug_name', d.name, 'category', d.category,
                 'qty', SUM(ii.quantity), 'revenue', SUM(ii.total_price)::numeric(14,2)) AS j
            FROM public.pharmacy_invoice_items ii
            JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
            JOIN public.pharmacy_drugs d ON d.id = ii.drug_id
           WHERE i.tenant_id = p_tenant_id
             AND i.status NOT IN ('cancelled','refunded')
             AND (p_branch IS NULL OR i.branch_id = p_branch)
             AND i.created_at >= date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval
           GROUP BY ii.drug_id, d.name, d.category) t;
  v_top := COALESCE(v_top, '[]'::jsonb);

  SELECT jsonb_agg(jsonb_build_object(
              'month', m.month, 'revenue', m.revenue, 'cost', m.cost,
              'profit', m.profit, 'invoice_count', m.invoice_count,
              'cash', m.cash, 'pos', m.pos, 'transfer', m.transfer,
              'card', m.card, 'insurance', m.insurance, 'refunds', m.refunds))
    INTO v_mon
  FROM public.pharmacy_monthly_financials(p_tenant_id, p_months, p_branch) m;
  v_mon := COALESCE(v_mon, '[]'::jsonb);

  SELECT jsonb_agg(jsonb_build_object(
              'drug_name', d.name, 'reason', l.reason, 'qty', l.quantity,
              'cost_impact', l.cost_impact, 'recorded_at', l.recorded_at))
    INTO v_ws
  FROM public.inventory_losses l
  JOIN public.pharmacy_drugs d ON d.id = l.drug_id
 WHERE l.tenant_id = p_tenant_id
   AND (p_branch IS NULL OR l.branch_id = p_branch)
   AND l.recorded_at >= date_trunc('month', CURRENT_DATE) - interval '11 months';
  v_ws := COALESCE(v_ws, '[]'::jsonb);

  v_kpi := (SELECT jsonb_build_object(
              'total_revenue', COALESCE(SUM(i.total_amount) FILTER (WHERE i.status NOT IN ('cancelled','refunded')), 0),
              'total_invoices', COUNT(*) FILTER (WHERE i.status NOT IN ('cancelled','refunded')),
              'cancelled', COUNT(*) FILTER (WHERE i.status IN ('cancelled','refunded')))
             FROM public.pharmacy_invoices i
            WHERE i.tenant_id = p_tenant_id
              AND (p_branch IS NULL OR i.branch_id = p_branch));

  RETURN jsonb_build_object(
    'as_of', now(),
    'kpi', v_kpi,
    'top_drugs', v_top,
    'monthly', jsonb_build_object('months', v_mon),
    'wastage_now', v_ws,
    'total_wastage_value', (SELECT COALESCE(SUM(l.cost_impact), 0)
                             FROM public.inventory_losses l
                            WHERE l.tenant_id = p_tenant_id
                              AND (p_branch IS NULL OR l.branch_id = p_branch)));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_analytics_dashboard(uuid, integer, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.pharmacy_monthly_financials(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_wastage_report(uuid, date, date, uuid) TO authenticated;

COMMIT;