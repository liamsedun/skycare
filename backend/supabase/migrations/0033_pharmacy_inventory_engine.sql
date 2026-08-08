-- ============================================================================
-- SKYCARE — MIGRATION 0033: PHARMACY INVENTORY ENGINE (production hardening)
--
-- Purpose: complete the stock engine on top of 0023:
--   1. branch_stock cache table  -> O(1) per-drug-per-branch totals
--   2. oversell guard            -> reject movements that deplete a batch below 0
--   3. FEFO allocation function   -> oldest-expiry-first batch allocation
--   4. expiry alerts              -> notifications for expiring <=30d / expired
--   5. low-stock net fix          -> notify on drug-level net stock, not per batch
--   6. indexes + grants
--
-- Idempotent. Deploy: `npx supabase db push --linked --yes`
-- ============================================================================

-- ============================================================================
-- 1. pharmacy_branch_stock — cached aggregate: one row per (branch, drug) with
--    the total shelf quantity. NULL branch_id = shared/central stock.
--    Maintained by a trigger on pharmacy_stock_batches (single source of truth
--    for quantity; the movement trigger already recomputes batches).
-- ============================================================================
CREATE TABLE IF NOT EXISTS pharmacy_branch_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       uuid REFERENCES branches(id) ON DELETE CASCADE,            -- NULL = central
  drug_id         uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE CASCADE,
  total_quantity  integer NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- one row per (branch, drug); allows branch_id NULL (central/shared stock)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_branch_stock
  ON pharmacy_branch_stock (branch_id, drug_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_pharmacy_branch_stock_drug
  ON pharmacy_branch_stock (drug_id, branch_id);

ALTER TABLE pharmacy_branch_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_branch_stock_staff_read ON pharmacy_branch_stock;
CREATE POLICY pharmacy_branch_stock_staff_read ON pharmacy_branch_stock FOR SELECT
  USING (EXISTS (SELECT 1 FROM pharmacy_drugs d
          WHERE d.id = pharmacy_branch_stock.drug_id
            AND d.tenant_id = get_tenant_id())
         AND is_staff() OR is_super_admin());

-- ---------------------------------------------------------------------------
-- Maintains the cache.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recompute_branch_stock(p_drug uuid, p_branch uuid)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO pharmacy_branch_stock (branch_id, drug_id, total_quantity, updated_at)
  SELECT p_branch, p_drug,
         COALESCE((SELECT SUM(quantity_on_hand) FROM pharmacy_stock_batches
                    WHERE drug_id = p_drug AND branch_id IS NOT DISTINCT FROM p_branch), 0),
         now()
  ON CONFLICT (branch_id, drug_id)
  DO UPDATE SET total_quantity = EXCLUDED.total_quantity, updated_at = now();
$$;

CREATE OR REPLACE FUNCTION fn_pharmacy_refresh_branch_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_drug   uuid;
  v_branch uuid;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_drug := NEW.drug_id; v_branch := NEW.branch_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    v_drug := OLD.drug_id; v_branch := OLD.branch_id;
  END IF;
  PERFORM fn_recompute_branch_stock(v_drug, v_branch);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_branch_stock ON pharmacy_stock_batches;
CREATE TRIGGER trg_pharmacy_branch_stock
  AFTER INSERT OR UPDATE OF quantity_on_hand, branch_id OR DELETE ON pharmacy_stock_batches
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_refresh_branch_stock();

-- backfill for existing data
INSERT INTO pharmacy_branch_stock (branch_id, drug_id, total_quantity)
SELECT branch_id, drug_id, SUM(quantity_on_hand)
FROM pharmacy_stock_batches GROUP BY branch_id, drug_id
ON CONFLICT (branch_id, drug_id) DO UPDATE
  SET total_quantity = EXCLUDED.total_quantity, updated_at = now();

-- ============================================================================
-- 2. OVERSELL GUARD — a movement may never drive a batch below zero.
--    Replaces the silent GREATEST clamp of 0023 so failures are loud + atomic.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_pharmacy_apply_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_new_qty integer;
  v_row     record;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT quantity_on_hand INTO v_row FROM pharmacy_stock_batches WHERE id = NEW.batch_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock batch % not found', NEW.batch_id;
    END IF;
    IF NEW.type = 'adjust' THEN
      v_new_qty := GREATEST(NEW.quantity, 0);
    ELSE
      v_new_qty := v_row.quantity_on_hand
                 + (CASE WHEN NEW.type IN ('in','transfer_in') THEN NEW.quantity ELSE -NEW.quantity END);
      IF v_new_qty < 0 THEN
        RAISE EXCEPTION 'Insufficient stock: batch % has %, movement of % would make it %',
          NEW.batch_id, v_row.quantity_on_hand, NEW.quantity, v_new_qty;
      END IF;
    END IF;
    UPDATE pharmacy_stock_batches
       SET quantity_on_hand = v_new_qty, updated_at = now()
     WHERE id = NEW.batch_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT quantity_on_hand INTO v_row FROM pharmacy_stock_batches WHERE id = OLD.batch_id;
    IF FOUND THEN
      IF OLD.type = 'adjust' THEN
        UPDATE pharmacy_stock_batches SET quantity_on_hand = 0, updated_at = now() WHERE id = OLD.batch_id;
      ELSE
        UPDATE pharmacy_stock_batches
           SET quantity_on_hand = GREATEST(v_row.quantity_on_hand
                 - (CASE WHEN OLD.type IN ('in','transfer_in') THEN OLD.quantity ELSE -OLD.quantity END), 0),
               updated_at = now()
         WHERE id = OLD.batch_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. FEFO ALLOCATION — returns batches ordered oldest-expiry-first that between
--    them can cover p_qty units of p_drug in p_branch (NULL = central).
--    Raises if the requested quantity cannot be covered.
--    Never touches expired batches.
-- ============================================================================
CREATE OR REPLACE FUNCTION pharmacy_fefo_allocate(
  p_tenant  uuid,
  p_drug    uuid,
  p_branch  uuid,
  p_qty     integer
) RETURNS TABLE (batch_id uuid, batch_number text, expiry_date date, quantity integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_remaining integer := p_qty;
  r record;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  FOR r IN
    SELECT id, batch_number, expiry_date, quantity_on_hand
      FROM pharmacy_stock_batches
     WHERE drug_id = p_drug
       AND tenant_id = p_tenant
       AND branch_id IS NOT DISTINCT FROM p_branch
       AND quantity_on_hand > 0
       AND expiry_date >= CURRENT_DATE
     ORDER BY expiry_date ASC, quantity_on_hand DESC
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;
    IF r.quantity_on_hand >= v_remaining THEN
      quantity := v_remaining;
      v_remaining := 0;
    ELSE
      quantity := r.quantity_on_hand;
      v_remaining := v_remaining - r.quantity_on_hand;
    END IF;
    batch_id := r.id; batch_number := r.batch_number; expiry_date := r.expiry_date;
    RETURN NEXT;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient FEFO stock: % still short', v_remaining;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_fefo_allocate(uuid, uuid, uuid, integer) TO authenticated;

-- ============================================================================
-- 4. EXPIRY ALERTS
--    a) on batch INSERT with an expiry <= today+30d -> in-app notification
--    b) on expiry pass today (never silently: the API layer + daily sweep)
--    c) period snippet below — attach to a daily job or the inventory endpoint
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_check_expiry_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_pharmacy_expiry_check(NEW.tenant_id, NEW.drug_id, NEW.id,
                                   NEW.expiry_date, NEW.quantity_on_hand);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_pharmacy_expiry_check(
  p_tenant    uuid,
  p_drug      uuid,
  p_batch     uuid,
  p_expiry    date,
  p_qty       integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_drug  text;
  v_days  integer;
  v_event text;
  v_title text;
  v_msg   text;
BEGIN
  IF p_qty <= 0 OR p_expiry IS NULL THEN RETURN; END IF;
  SELECT name INTO v_drug FROM pharmacy_drugs WHERE id = p_drug;
  v_days := p_expiry - CURRENT_DATE;

  IF v_days < 0 THEN
    v_event := 'expiry_expired'; v_title := 'Expired stock';
    v_msg := 'Batch ' || p_batch || ' of ' || COALESCE(v_drug, 'drug') || ' EXPIRED on ' || p_expiry;
  ELSIF v_days <= 30 THEN
    v_event := 'expiry_warning'; v_title := 'Expiring soon';
    v_msg := 'Batch ' || p_batch || ' of ' || COALESCE(v_drug, 'drug') || ' expires in ' || v_days || ' days (' || p_expiry || ')';
  ELSE
    RETURN;
  END IF;

  INSERT INTO notifications (tenant_id, channel, event, title, message, reference_type, reference_id)
  VALUES (p_tenant, 'in_app', v_event, v_title, v_msg, 'pharmacy_drug', p_drug);
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_expiry_alert ON pharmacy_stock_batches;
CREATE TRIGGER trg_pharmacy_expiry_alert
  AFTER INSERT ON pharmacy_stock_batches
  FOR EACH ROW
  WHEN (NEW.quantity_on_hand > 0)
  EXECUTE FUNCTION fn_check_expiry_on_insert();

-- re-sweep existing batches so alerts cover already-restocked inventory
SELECT fn_pharmacy_expiry_check(tenant_id, drug_id, id, expiry_date, quantity_on_hand)
  FROM pharmacy_stock_batches WHERE quantity_on_hand > 0;

-- sweep entrypoint for the API layer (POST /api/pharmacy/inventory/sweep):
--   SELECT fn_pharmacy_expiry_sweep(p_tenant)
CREATE OR REPLACE FUNCTION fn_pharmacy_expiry_sweep(p_tenant uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_batch  record;
  v_count  integer := 0;
BEGIN
  FOR v_batch IN
    SELECT id, drug_id, expiry_date, quantity_on_hand
      FROM pharmacy_stock_batches
     WHERE tenant_id = p_tenant AND quantity_on_hand > 0
       AND expiry_date <= CURRENT_DATE + 30
  LOOP
    PERFORM fn_pharmacy_expiry_check(p_tenant, v_batch.drug_id, v_batch.id,
                                     v_batch.expiry_date, v_batch.quantity_on_hand);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION fn_pharmacy_expiry_sweep(uuid) TO authenticated;

-- ============================================================================
-- 5. LOW-STOCK — rewrite to fire on the drug-level NET stock (sum across
--    batches), once per crossing, per (drug, branch).
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_notify_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_drug   record;
  v_reorder integer;
  v_net    integer;
BEGIN
  SELECT name, reorder_level INTO v_drug FROM pharmacy_drugs WHERE id = NEW.drug_id;
  v_reorder := COALESCE(v_drug.reorder_level, 0);

  SELECT COALESCE(SUM(quantity_on_hand), 0) INTO v_net
    FROM pharmacy_stock_batches
   WHERE drug_id = NEW.drug_id AND branch_id IS NOT DISTINCT FROM NEW.branch_id;

  IF v_net > v_reorder THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- fire once per crossing: skip repeats while still at/below reorder
  IF EXISTS (SELECT 1 FROM notifications
              WHERE tenant_id = NEW.tenant_id
                AND event = 'low_stock'
                AND reference_type = 'pharmacy_drug'
                AND reference_id = NEW.drug_id::text
                AND created_at > now() - interval '6 hours') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO notifications (tenant_id, channel, event, title, message, reference_type, reference_id)
  VALUES (
    NEW.tenant_id, 'in_app', 'low_stock', 'Low stock alert',
    'Stock for ' || COALESCE(v_drug.name, 'drug') || ' is at ' || v_net || ' (reorder level ' || v_reorder || ')',
    'pharmacy_drug', NEW.drug_id
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. INDEXES — extra paths for the inventory engine
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pharmacy_movements_branch
  ON pharmacy_stock_movements (branch_id, created_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_pharm
  ON notifications (tenant_id, created_at DESC) WHERE reference_type = 'pharmacy_drug';