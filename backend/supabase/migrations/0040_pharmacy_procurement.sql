-- ============================================================================
-- SKYCARE — MIGRATION 0040: PHARMACY PROCUREMENT ENGINE
--
-- Supplier pricing, purchase order lifecycle, GRN-to-stock, cost analytics.
-- The 0001 legacy tables `purchase_orders` / `po_items` / `goods_receipts`
-- belong to the retired drugs model and are intentionally left untouched;
-- the pharmacy engine uses pharmacy_*-prefixed tables instead.
--
--   supplier_drug_prices               per-drug supplier offers
--   pharmacy_purchase_orders           PO header, full lifecycle
--   pharmacy_purchase_order_items      order lines (ordered vs received)
--   pharmacy_goods_received_notes      GRN header (partial deliveries)
--   pharmacy_grn_items                 received lines -> auto stock batches
--
-- Functions:
--   pharmacy_po_create(tenant, supplier, branch, items jsonb, ...)  -> po uuid
--   pharmacy_po_transition(tenant, po, status, user)                -> state machine
--   pharmacy_grn_receive(tenant, po, user, branch, items jsonb)     -> grn uuid
--   pharmacy_reorder_suggestions(tenant)                            -> auto-PO rows
--   pharmacy_procurement_stats(tenant, from, to)                    -> cost analytics
--
-- RLS: SELECT for staff; writes stay service-client only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SUPPLIER PRICING — one row per (tenant, supplier, drug)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_drug_prices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id         uuid NOT NULL REFERENCES pharmacy_suppliers(id) ON DELETE CASCADE,
  drug_id             uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE CASCADE,
  unit_cost           numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  min_order_quantity  integer NOT NULL DEFAULT 1 CHECK (min_order_quantity > 0),
  lead_time_days      integer NOT NULL DEFAULT 3 CHECK (lead_time_days >= 0),
  is_preferred        boolean NOT NULL DEFAULT false,
  last_updated        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, supplier_id, drug_id)
);
CREATE INDEX IF NOT EXISTS idx_spd_drug     ON supplier_drug_prices (tenant_id, drug_id);
CREATE INDEX IF NOT EXISTS idx_spd_supplier ON supplier_drug_prices (tenant_id, supplier_id);

-- supplier rating (performance indicator, 0-5)
ALTER TABLE pharmacy_suppliers ADD COLUMN IF NOT EXISTS rating numeric(2,1)
  CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));

-- ---------------------------------------------------------------------------
-- 2. PURCHASE ORDERS + ITEMS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_purchase_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_number    text NOT NULL,
  supplier_id  uuid NOT NULL REFERENCES pharmacy_suppliers(id) ON DELETE RESTRICT,
  branch_id    uuid REFERENCES branches(id) ON DELETE SET NULL,      -- NULL = central
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','approved','received','cancelled')),
  total_cost   numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  notes        text,
  expected_by  date,                                                 -- delivery target
  created_by   uuid,
  approved_by  uuid,
  approved_at  timestamptz,
  received_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_po_tenant_status ON pharmacy_purchase_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_po_supplier      ON pharmacy_purchase_orders (tenant_id, supplier_id);

CREATE TABLE IF NOT EXISTS pharmacy_purchase_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES pharmacy_purchase_orders(id) ON DELETE CASCADE,
  drug_id           uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE RESTRICT,
  quantity_ordered  integer NOT NULL CHECK (quantity_ordered > 0),
  quantity_received integer NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost         numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  received_cost     numeric(12,2) NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, drug_id)
);
CREATE INDEX IF NOT EXISTS idx_poi_po   ON pharmacy_purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_drug ON pharmacy_purchase_order_items (drug_id);

-- ---------------------------------------------------------------------------
-- 3. GOODS RECEIVED NOTES (GRN)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_goods_received_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grn_number        text NOT NULL,
  purchase_order_id uuid NOT NULL REFERENCES pharmacy_purchase_orders(id) ON DELETE CASCADE,
  branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
  received_by       uuid,
  notes             text,
  received_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, grn_number)
);
CREATE INDEX IF NOT EXISTS idx_grn_po ON pharmacy_goods_received_notes (purchase_order_id);

CREATE TABLE IF NOT EXISTS pharmacy_grn_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id            uuid NOT NULL REFERENCES pharmacy_goods_received_notes(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES pharmacy_purchase_orders(id) ON DELETE CASCADE,
  po_item_id        uuid NOT NULL REFERENCES pharmacy_purchase_order_items(id) ON DELETE CASCADE,
  drug_id           uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE RESTRICT,
  quantity_received integer NOT NULL CHECK (quantity_received > 0),
  quantity_ordered  integer NOT NULL CHECK (quantity_ordered > 0),
  unit_cost         numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  batch_number      text NOT NULL,
  expiry_date       date,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grni_grn  ON pharmacy_grn_items (grn_id);
CREATE INDEX IF NOT EXISTS idx_grni_drug ON pharmacy_grn_items (drug_id);

-- ---------------------------------------------------------------------------
-- RLS — staff can READ, writes via service client (consistent w/ suppliers)
-- ---------------------------------------------------------------------------
ALTER TABLE supplier_drug_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_purchase_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_purchase_order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_goods_received_notes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_grn_items              ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_drug_prices_read ON supplier_drug_prices;
CREATE POLICY supplier_drug_prices_read ON supplier_drug_prices FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS pharmacy_po_read ON pharmacy_purchase_orders;
CREATE POLICY pharmacy_po_read ON pharmacy_purchase_orders FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS pharmacy_po_items_read ON pharmacy_purchase_order_items;
CREATE POLICY pharmacy_po_items_read ON pharmacy_purchase_order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM pharmacy_purchase_orders po
          WHERE po.id = pharmacy_purchase_order_items.purchase_order_id
            AND (po.tenant_id = get_tenant_id() OR is_super_admin())));

DROP POLICY IF EXISTS pharmacy_grn_read ON pharmacy_goods_received_notes;
CREATE POLICY pharmacy_grn_read ON pharmacy_goods_received_notes FOR SELECT
  USING (tenant_id = get_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS pharmacy_grni_read ON pharmacy_grn_items;
CREATE POLICY pharmacy_grni_read ON pharmacy_grn_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM pharmacy_goods_received_notes grn
          WHERE grn.id = pharmacy_grn_items.grn_id
            AND (grn.tenant_id = get_tenant_id() OR is_super_admin())));

-- ---------------------------------------------------------------------------
-- 4. PURCHASE ORDER CREATION (draft, duplicate-ware, po_number)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_po_create(
  p_tenant_id uuid,
  p_supplier  uuid,
  p_branch    text,                -- NULL = central
  p_items     jsonb,               -- [{drug_id, quantity, unit_cost, notes?}]
  p_notes     text DEFAULT NULL,
  p_expected_by date DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_supplier   record;
  v_branch     uuid := NULLIF(p_branch, '')::uuid;
  v_po         uuid;
  v_line_total numeric;
  v_total      numeric(12,2) := 0;
  v_pos        integer;
  v_drugs      uuid[] := '{}';
  v_item       jsonb;
BEGIN
  IF p_supplier IS NULL THEN RAISE EXCEPTION 'supplier_id is required'; END IF;
  SELECT * INTO v_supplier FROM pharmacy_suppliers
    WHERE id = p_supplier AND tenant_id = p_tenant_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'supplier not found or inactive in tenant'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'at least one order item is required';
  END IF;

  -- validate every item: positive qty, sane cost, drug belongs to tenant
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS j(item)
  LOOP
    IF (v_item->>'drug_id') IS NULL THEN RAISE EXCEPTION 'drug_id is required on every item'; END IF;
    IF (v_item->>'quantity')::integer <= 0 THEN
      RAISE EXCEPTION 'quantity must be positive for drug %', v_item->>'drug_id';
    END IF;
    IF (v_item->>'unit_cost')::numeric < 0 THEN
      RAISE EXCEPTION 'unit_cost cannot be negative for drug %', v_item->>'drug_id';
    END IF;
    v_drugs := v_drugs || (v_item->>'drug_id')::uuid;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pharmacy_drugs d
              WHERE d.id = ANY(v_drugs) AND d.tenant_id <> p_tenant_id) THEN
    RAISE EXCEPTION 'one or more items do not belong to this tenant';
  END IF;

  -- duplicate prevention: no open (draft/sent/approved) PO covering ANY of
  -- these drugs from this supplier
  IF EXISTS (
    SELECT 1 FROM pharmacy_purchase_orders po
    JOIN pharmacy_purchase_order_items pi ON pi.purchase_order_id = po.id
    WHERE po.tenant_id = p_tenant_id
      AND po.supplier_id = p_supplier
      AND po.status IN ('draft','sent','approved')
      AND pi.drug_id = ANY(v_drugs)
  ) THEN RAISE EXCEPTION 'An open purchase order already exists for this supplier covering one of these drugs'; END IF;

  -- po number: PO-YYYY-NNN per tenant
  SELECT COALESCE(MAX(CAST(substr(po_number, 10) AS integer)), 0) + 1 INTO v_pos
    FROM pharmacy_purchase_orders
   WHERE tenant_id = p_tenant_id
     AND po_number LIKE 'PO-' || to_char(now(),'YYYY') || '-%';
  IF v_pos IS NULL THEN v_pos := 1; END IF;

  INSERT INTO pharmacy_purchase_orders
    (tenant_id, po_number, supplier_id, branch_id, status, total_cost, notes, expected_by, created_by)
  VALUES (p_tenant_id, 'PO-' || to_char(now(),'YYYY') || '-' || lpad(v_pos::text, 3, '0'),
          p_supplier, v_branch, 'draft', 0, COALESCE(p_notes, ''), p_expected_by, p_created_by)
  RETURNING id INTO v_po;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS j(item)
  LOOP
    INSERT INTO pharmacy_purchase_order_items
      (purchase_order_id, drug_id, quantity_ordered, unit_cost, notes)
    VALUES (v_po, (v_item->>'drug_id')::uuid,
            (v_item->>'quantity')::integer,
            (v_item->>'unit_cost')::numeric,
            v_item->>'notes')
    RETURNING quantity_ordered * unit_cost INTO v_line_total;
    v_total := v_total + v_line_total;
  END LOOP;

  UPDATE pharmacy_purchase_orders SET total_cost = v_total WHERE id = v_po;
  RETURN v_po;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_po_create(uuid, uuid, text, jsonb, text, date, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. PO STATE MACHINE
--    draft -> sent -> approved ; sent/approved -> received (via GRN);
--    any open -> cancelled
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_po_transition(
  p_tenant_id uuid,
  p_po_id     uuid,
  p_status    text,
  p_user_id   uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_po record;
BEGIN
  SELECT status INTO v_po FROM pharmacy_purchase_orders
    WHERE id = p_po_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not found'; END IF;

  IF p_status = 'cancelled' THEN
    IF v_po.status = 'received' THEN
      RAISE EXCEPTION 'a received purchase order cannot be cancelled';
    END IF;
    UPDATE pharmacy_purchase_orders SET status = 'cancelled' WHERE id = p_po_id;
    RETURN;
  END IF;

  IF p_status = 'sent' THEN
    IF v_po.status <> 'draft' THEN
      RAISE EXCEPTION 'only a draft purchase order can be sent to a supplier';
    END IF;
    UPDATE pharmacy_purchase_orders SET status = 'sent' WHERE id = p_po_id;
    RETURN;
  END IF;

  IF p_status = 'approved' THEN
    IF v_po.status NOT IN ('draft','sent') THEN
      RAISE EXCEPTION 'only draft or sent purchase orders can be approved';
    END IF;
    UPDATE pharmacy_purchase_orders
       SET status = 'approved', approved_by = p_user_id, approved_at = now()
     WHERE id = p_po_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'unsupported status transition to %', p_status;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_po_transition(uuid, uuid, text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. GRN RECEIVING — partial deliveries, discrepancy guard, restock
--    p_items = [{po_item_id, quantity_received, batch_number, expiry_date,
--                actual_cost}]  (actual_cost NULL -> use PO unit_cost)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_grn_receive(
  p_tenant_id  uuid,
  p_po_id      uuid,
  p_user_id    uuid,
  p_branch     text,
  p_items      jsonb,
  p_notes      text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_po        record;
  v_branch    uuid := NULLIF(p_branch, '')::uuid;
  v_grn       uuid;
  v_grn_no    text;
  v_item      jsonb;
  v_grni      record;
  v_poitem    record;
  v_qty       integer;
  v_remain    integer;
  v_seq       integer;
  v_batch     uuid;
BEGIN
  SELECT * INTO v_po FROM pharmacy_purchase_orders
    WHERE id = p_po_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not found'; END IF;

  IF v_po.status NOT IN ('sent','approved') THEN
    RAISE EXCEPTION 'only sent or approved purchase orders can be received (current: %)', v_po.status;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'no received items supplied';
  END IF;

  -- GRN number per tenant
  SELECT COALESCE(MAX(CAST(substr(grn_number, 5) AS integer)), 0) + 1 INTO v_seq
    FROM pharmacy_goods_received_notes
   WHERE tenant_id = p_tenant_id AND grn_number LIKE 'GRN-%';
  IF v_seq IS NULL THEN v_seq := 1; END IF;
  v_grn_no := 'GRN-' || lpad(v_seq::text, 4, '0');

  INSERT INTO pharmacy_goods_received_notes
    (tenant_id, grn_number, purchase_order_id, branch_id, received_by, notes, received_at)
  VALUES (p_tenant_id, v_grn_no, p_po_id, COALESCE(v_branch, v_po.branch_id),
          p_user_id, p_notes, now())
  RETURNING id INTO v_grn;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) AS j(item)
  LOOP
    SELECT * INTO v_poitem FROM pharmacy_purchase_order_items
      WHERE purchase_order_id = p_po_id AND id = (v_item->>'po_item_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'po_item % not found on this purchase order', v_item->>'po_item_id';
    END IF;

    v_qty := (v_item->>'quantity_received')::integer;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'quantity received must be positive for item %', v_poitem.id;
    END IF;

    -- partial-delivery guard: can never exceed the remaining shortfall
    v_remain := v_poitem.quantity_ordered - v_poitem.quantity_received;
    IF v_qty > v_remain THEN
      RAISE EXCEPTION 'receiving % exceeds the remaining shortfall (%) of item % — partial delivery only',
        v_qty, v_remain, v_poitem.id;
    END IF;

    INSERT INTO pharmacy_grn_items
      (grn_id, purchase_order_id, po_item_id, drug_id,
       quantity_received, quantity_ordered, unit_cost, batch_number, expiry_date, notes)
    VALUES (v_grn, p_po_id, v_poitem.id, v_poitem.drug_id,
            v_qty, v_poitem.quantity_ordered,
            COALESCE((v_item->>'actual_cost')::numeric, v_poitem.unit_cost),
            v_item->>'batch_number', (v_item->>'expiry_date')::date,
            v_item->>'notes');
  END LOOP;

  -- update received counters
  UPDATE pharmacy_purchase_order_items oi
     SET quantity_received = oi.quantity_received + COALESCE(g.qty_total, 0),
         received_cost     = oi.received_cost + COALESCE(g.cost_total, 0)
    FROM (SELECT po_item_id,
                 SUM(quantity_received)                          AS qty_total,
                 SUM(quantity_received * unit_cost)              AS cost_total
            FROM pharmacy_grn_items
           WHERE grn_id = v_grn
           GROUP BY po_item_id) g
   WHERE oi.id = g.po_item_id;

  -- integrate with inventory: create stock batches + ledger movements
  -- (the movement trigger applies quantities atomically, FEFO/expiry-safe)
  FOR v_grni IN SELECT * FROM pharmacy_grn_items
                 WHERE grn_id = v_grn
  LOOP
    IF v_grni.expiry_date IS NOT NULL AND v_grni.expiry_date <= CURRENT_DATE THEN
      RAISE EXCEPTION 'cannot receive expired batch % (expiry %)',
        v_grni.batch_number, v_grni.expiry_date;
    END IF;
    -- reuse existing batch (same drug + branch + batch number) or create fresh;
    -- quantity_on_hand starts at 0 and the movement trigger applies the qty
    SELECT id INTO v_batch
      FROM pharmacy_stock_batches
     WHERE tenant_id = p_tenant_id AND drug_id = v_grni.drug_id
       AND branch_id IS NOT DISTINCT FROM COALESCE(v_branch, v_po.branch_id)
       AND batch_number = v_grni.batch_number
     LIMIT 1;
    IF v_batch IS NULL THEN
      INSERT INTO pharmacy_stock_batches
        (tenant_id, drug_id, branch_id, supplier_id, batch_number, expiry_date,
         quantity_on_hand, cost_price, location)
      VALUES (p_tenant_id, v_grni.drug_id,
              COALESCE(v_branch, v_po.branch_id), v_po.supplier_id,
              v_grni.batch_number, COALESCE(v_grni.expiry_date, now()::date + 365),
              0, v_grni.unit_cost,
              'PO ' || v_po.po_number || ' / ' || v_grn_no)
      RETURNING id INTO v_batch;
    ELSIF v_po.supplier_id IS NOT NULL THEN
      UPDATE pharmacy_stock_batches
         SET supplier_id = COALESCE(supplier_id, v_po.supplier_id)
       WHERE id = v_batch;
    END IF;
    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes, created_by)
    VALUES (p_tenant_id, v_grni.drug_id, v_batch,
            COALESCE(v_branch, v_po.branch_id), 'in', v_grni.quantity_received,
            v_grn_no, v_po.po_number, p_user_id);
  END LOOP;

  -- PO fully received => close it
  IF NOT EXISTS (SELECT 1 FROM pharmacy_purchase_order_items
                  WHERE purchase_order_id = p_po_id
                    AND quantity_received < quantity_ordered) THEN
    UPDATE pharmacy_purchase_orders
       SET status = 'received', received_at = now()
     WHERE id = p_po_id;
  END IF;

  RETURN v_grn;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_grn_receive(uuid, uuid, uuid, text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. REORDER SUGGESTIONS (auto-PO) — low/out stock + 30-day usage + best offer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_reorder_suggestions(p_tenant_id uuid)
RETURNS TABLE (
  drug_id              uuid,
  drug_name            text,
  category             text,
  current_stock        integer,
  reorder_level        integer,
  suggested_qty        integer,
  avg_daily_use        numeric,
  preferred_supplier_id uuid,
  supplier_name        text,
  best_price           numeric,
  lead_time_days       integer,
  has_offer            boolean,
  usage_30d            bigint,
  min_order_quantity   integer
) LANGUAGE sql STABLE AS $$
  WITH stock AS (
    SELECT d.id, d.name, d.category, d.reorder_level, d.reorder_qty,
           COALESCE(SUM(b.quantity_on_hand), 0)::integer AS current_stock
      FROM pharmacy_drugs d
      LEFT JOIN pharmacy_stock_batches b
        ON b.drug_id = d.id AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
     WHERE d.tenant_id = p_tenant_id AND d.is_active
     GROUP BY d.id
  ),
  usage_30 AS (
    SELECT m.drug_id, COALESCE(SUM(m.quantity) FILTER
                     (WHERE m.type IN ('dispense','transfer_out')), 0) AS qty_30d
      FROM pharmacy_stock_movements m
     WHERE m.tenant_id = p_tenant_id
       AND m.created_at >= now() - interval '30 days'
     GROUP BY m.drug_id
  ),
  offers AS (
    SELECT sdp.drug_id, sdp.supplier_id, s.name AS supplier_name,
           sdp.unit_cost, sdp.lead_time_days, sdp.min_order_quantity,
           ROW_NUMBER() OVER (PARTITION BY sdp.drug_id
                              ORDER BY sdp.is_preferred DESC, sdp.unit_cost ASC) AS rk
      FROM supplier_drug_prices sdp
      JOIN pharmacy_suppliers s ON s.id = sdp.supplier_id
     WHERE sdp.tenant_id = p_tenant_id AND s.is_active
  )
  SELECT s.id, s.name, s.category::text, s.current_stock, s.reorder_level,
         CASE WHEN u.qty_30d > 0
              THEN GREATEST(s.reorder_qty,
                            CEIL(u.qty_30d / 30.0 * (COALESCE(o.lead_time_days,3) + 3))::int)
              ELSE s.reorder_qty END,
         ROUND(COALESCE(u.qty_30d, 0) / 30.0, 1),
         o.supplier_id, o.supplier_name, COALESCE(o.unit_cost, 0)::numeric,
         COALESCE(o.lead_time_days, 10), o.supplier_id IS NOT NULL,
         COALESCE(u.qty_30d, 0), COALESCE(o.min_order_quantity, 1)
    FROM stock s
    LEFT JOIN usage_30 u ON u.drug_id = s.id
    LEFT JOIN offers o    ON o.drug_id = s.id AND o.rk = 1
   WHERE s.current_stock <= s.reorder_level
   ORDER BY (s.current_stock - s.reorder_level) ASC, s.name;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_reorder_suggestions(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. PROCUREMENT COST ANALYTICS (GRN-weighted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_procurement_stats(
  p_tenant_id uuid,
  p_from date DEFAULT (now() - interval '90 days')::date,
  p_to   date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  period_start date,
  period_end   date,
  total_cost   numeric,
  total_units  bigint,
  grn_count    bigint,
  po_count     bigint,
  by_drug      jsonb
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_by_drug jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(t ORDER BY t.total_cost DESC), '[]'::jsonb) INTO v_by_drug
    FROM (
      SELECT gi.drug_id,
             d.name AS drug_name,
             SUM(gi.quantity_received * gi.unit_cost)  AS total_cost,
             SUM(gi.quantity_received)                 AS units,
             AVG(gi.unit_cost)::numeric(12,2)          AS avg_unit_cost
        FROM pharmacy_grn_items gi
        JOIN pharmacy_drugs d ON d.id = gi.drug_id
        JOIN pharmacy_goods_received_notes grn ON grn.id = gi.grn_id
       WHERE grn.tenant_id = p_tenant_id
         AND grn.received_at >= p_from::timestamptz
         AND grn.received_at < (p_to + 1)::timestamptz
       GROUP BY gi.drug_id, d.name
    ) AS t;

  RETURN QUERY
  SELECT p_from::date, p_to::date,
         COALESCE((SELECT SUM(g.quantity_received * g.unit_cost)
                     FROM pharmacy_grn_items g
                     JOIN pharmacy_goods_received_notes grn ON grn.id = g.grn_id
                    WHERE grn.tenant_id = p_tenant_id
                      AND grn.received_at >= p_from::timestamptz
                      AND grn.received_at < (p_to + 1)::timestamptz), 0),
         COALESCE((SELECT SUM(g.quantity_received)
                     FROM pharmacy_grn_items g
                     JOIN pharmacy_goods_received_notes grn ON grn.id = g.grn_id
                    WHERE grn.tenant_id = p_tenant_id
                      AND grn.received_at >= p_from::timestamptz
                      AND grn.received_at < (p_to + 1)::timestamptz), 0),
         COALESCE((SELECT COUNT(*) FROM pharmacy_goods_received_notes
                    WHERE tenant_id = p_tenant_id
                      AND received_at >= p_from::timestamptz
                      AND received_at < (p_to + 1)::timestamptz), 0),
         COALESCE((SELECT COUNT(*) FROM pharmacy_purchase_orders
                    WHERE tenant_id = p_tenant_id
                      AND created_at >= p_from::timestamptz
                      AND created_at < (p_to + 1)::timestamptz), 0),
         v_by_drug;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_procurement_stats(uuid, date, date) TO authenticated;