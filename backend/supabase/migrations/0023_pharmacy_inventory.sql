-- ============================================================================
-- SKYCARE — MIGRATION 0023: PHARMACY INVENTORY
--
-- Purpose: full pharmacy inventory for the HMS — drugs catalogue, batch-level
-- stock, suppliers, and a movement ledger. Multi-branch aware (branch_id NULL
-- = shared/central), batch + expiry tracked, reorder levels, low-stock
-- notifications and automatic stock accounting on every movement.
--
-- NOTE ON NAMING: migration 0001 already defines `drugs`, `drug_batches`,
-- `suppliers` and `stock_movements` (legacy, unreferenced by any API/UI). To
-- avoid conflicts, this module uses `pharmacy_drugs`, `pharmacy_stock_batches`,
-- `pharmacy_suppliers` and `pharmacy_stock_movements`. If you later retire the
-- legacy tables, you can rename without touching this file.
--
-- Idempotent. Deploy: `npx supabase db push --linked --yes`
-- ============================================================================

-- ============================================================================
-- 0. EXTENSION — trigram search for drug names
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1. pharmacy_drugs — catalog (one row per drug + form + strength + pack)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pharmacy_drugs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             uuid REFERENCES branches(id) ON DELETE SET NULL, -- NULL = shared/central
  name                  text NOT NULL,                -- e.g. "Augmentin 625mg Tablets x14"
  generic_name          text,                         -- e.g. "Amoxicillin/Clavulanic Acid"
  brand                 text,                         -- e.g. "Augmentin"
  category              text NOT NULL,                -- Antibiotics | Antimalarials | Analgesics | Antihypertensives | Diabetes | Respiratory | Gastrointestinal | Vitamins & Supplements
  form                  text NOT NULL,                -- tablet | capsule | softgel | syrup | suspension | injection | infusion | inhaler | cream | gel | ointment | suppository | pessary | sachet | powder | solution | nebule | shampoo | caplet
  dosage                text,                         -- "625mg", "80/480mg", "250mg/5ml"
  sku                   text,
  wholesale_price       numeric(12,2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  unit_price            numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0), -- NGN retail
  reorder_level         integer NOT NULL DEFAULT 10 CHECK (reorder_level >= 0),
  reorder_qty           integer NOT NULL DEFAULT 100 CHECK (reorder_qty >= 0),
  requires_rx           boolean NOT NULL DEFAULT true,
  is_controlled         boolean NOT NULL DEFAULT false, -- NAFDAC / controlled drug
  nafdac_number         text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pharmacy_drug UNIQUE (tenant_id, name),
  CONSTRAINT chk_pharmacy_drug_form CHECK (
    form IN ('tablet','capsule','softgel','caplet','syrup','suspension','injection','infusion',
             'inhaler','nebule','cream','gel','ointment','suppository','pessary','sachet',
             'powder','solution','shampoo','bottle','solution_vial')
  )
);

-- ---------------------------------------------------------------------------
-- 2. pharmacy_stock_batches — batch-level stock with expiry & cost
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_stock_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  drug_id          uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE CASCADE,
  branch_id        uuid REFERENCES branches(id) ON DELETE SET NULL, -- NULL = shared/central
  supplier_id      uuid,                                          -- FK added below
  batch_number     text NOT NULL,
  expiry_date      date NOT NULL,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  cost_price       numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  location         text,                                          -- shelf/rack e.g. "Shelf A-12"
  received_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pharmacy_batch UNIQUE (branch_id, batch_number, drug_id),
  CONSTRAINT chk_pharmacy_batch_expiry CHECK (expiry_date > '1900-01-01')
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_batches_drug   ON pharmacy_stock_batches (drug_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_batches_expiry ON pharmacy_stock_batches (expiry_date)
  WHERE expiry_date IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. pharmacy_suppliers — vendors / wholesalers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  name            text NOT NULL,
  code            text,
  contact_person  text,
  phone           text,
  email           text,
  address         text,
  nafdac_license  text,                                     -- NAFDAC licensed distributor
  payment_terms   text DEFAULT 'net 30',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pharmacy_supplier UNIQUE (tenant_id, name),
  CONSTRAINT uq_pharmacy_supplier_code UNIQUE (tenant_id, code)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pharmacy_batch_supplier') THEN
    ALTER TABLE pharmacy_stock_batches
      ADD CONSTRAINT fk_pharmacy_batch_supplier
      FOREIGN KEY (supplier_id) REFERENCES pharmacy_suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. pharmacy_stock_movements — the ledger. A row is one stock event:
--    'in' | 'out' | 'adjust' | 'transfer_in' | 'transfer_out' | 'dispense' | 'waste'
--    Dispense rows are created when a prescription is dispensed; the trigger
--    (section 6) updates / health-checks the batch quantity automatically.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_stock_movements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  drug_id      uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE CASCADE,
  batch_id     uuid REFERENCES pharmacy_stock_batches(id) ON DELETE SET NULL,
  branch_id    uuid REFERENCES branches(id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('in','out','adjust','transfer_in','transfer_out','dispense','waste')),
  quantity     integer NOT NULL CHECK (quantity <> 0),
  -- Quantity semantics:
  --   'in','transfer_in'         -> +quantity
  --   'out','dispense','waste'   -> -quantity
  --   'transfer_out'             -> -quantity (sibling +row with transfer_in in the other branch)
  --   'adjust'                   -> absolute: batch.quantity_on_hand := quantity
  source_ref   text,            -- prescription id / PO id / requisition id
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_movements_drug   ON pharmacy_stock_movements (drug_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_movements_batch  ON pharmacy_stock_movements (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_movements_tenant ON pharmacy_stock_movements (tenant_id, created_at DESC);

-- ============================================================================
-- 5. RLS — staff of the tenant can READ; the API layer (service role) writes,
--    mirroring the pattern used by lab_requests / pharmacy in 0022.
-- ============================================================================
ALTER TABLE pharmacy_drugs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_stock_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_suppliers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_stock_movements ENABLE ROW LEVEL SECURITY;

-- pharmacy_drugs
DROP POLICY IF EXISTS pharmacy_drugs_staff_read ON pharmacy_drugs;
CREATE POLICY pharmacy_drugs_staff_read ON pharmacy_drugs FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_staff() OR is_super_admin());

-- pharmacy_stock_batches (batches readable by staff of the owning tenant;
-- warehouse/pharma roles manage via API)
DROP POLICY IF EXISTS pharmacy_stock_batches_staff_read ON pharmacy_stock_batches;
CREATE POLICY pharmacy_stock_batches_staff_read ON pharmacy_stock_batches FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_staff() OR is_super_admin());

-- pharmacy_suppliers
DROP POLICY IF EXISTS pharmacy_suppliers_staff_read ON pharmacy_suppliers;
CREATE POLICY pharmacy_suppliers_staff_read ON pharmacy_suppliers FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_staff() OR is_super_admin());

-- pharmacy_stock_movements (staff read; writers service-role only)
DROP POLICY IF EXISTS pharmacy_stock_movements_staff_read ON pharmacy_stock_movements;
CREATE POLICY pharmacy_stock_movements_staff_read ON pharmacy_stock_movements FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_staff() OR is_super_admin());

-- ============================================================================
-- 6. INDEXES — drug search / low stock / expiry queries
-- ============================================================================
-- Name/genetic/brand ILIKE search via trigram index
CREATE INDEX IF NOT EXISTS idx_pharmacy_drugs_name_trgm
  ON pharmacy_drugs USING gist (name gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pharmacy_drugs_generic_trgm
  ON pharmacy_drugs USING gist (generic_name gist_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pharmacy_drugs_brand_trgm
  ON pharmacy_drugs USING gist (brand gist_trgm_ops);

-- category + active = fast catalog listing / pickers
CREATE INDEX IF NOT EXISTS idx_pharmacy_drugs_tenant_brand   ON pharmacy_drugs (tenant_id, branch_id, brand);
CREATE INDEX IF NOT EXISTS idx_pharmacy_drugs_tenant_cat      ON pharmacy_drugs (tenant_id, category);

-- low-stock alert query: batches under reorder level per drug
-- (reorder_level lives on pharmacy_drugs, so the join drives the query;
--  this plain index covers the join + ordering)
CREATE INDEX IF NOT EXISTS idx_pharmacy_batches_lowstock
  ON pharmacy_stock_batches (drug_id, branch_id, quantity_on_hand);

-- expiry queries: batch expiring within X days (plain index — covers
-- `expiry_date < now() + interval '30 days'` range scans; partial-index
-- predicates must be IMMUTABLE and would go stale anyway)
CREATE INDEX IF NOT EXISTS idx_pharmacy_batches_expiry_window
  ON pharmacy_stock_batches (expiry_date, quantity_on_hand);

-- ============================================================================
-- 7. SEARCH FUNCTION — returns rows matching name / generic / brand / sku
--    Compatible with PostgREST -> can be exposed as an RPC endpoint.
-- ============================================================================
CREATE OR REPLACE FUNCTION search_pharmacy_drugs(
  p_tenant  uuid,
  p_query   text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_branch  uuid DEFAULT NULL
) RETURNS SETOF pharmacy_drugs
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM pharmacy_drugs
  WHERE tenant_id = p_tenant
    AND (p_branch IS NULL OR branch_id IS NULL OR branch_id = p_branch)
    AND (p_category IS NULL OR category = p_category)
    AND (p_query IS NULL OR p_query = ''
         OR name ILIKE '%' || p_query || '%'
         OR generic_name ILIKE '%' || p_query || '%'
         OR brand ILIKE '%' || p_query || '%')
  ORDER BY name;
$$;

-- ============================================================================
-- 8. TRIGGERS
-- ----------------------------------------------------------------------------
-- 8a. AUTO-STOCK: apply a movement's effect to the batch on INSERT/UPDATE/DELETE
-- 8b. LOW-STOCK NOTIFICATION: fire notification when a batch crosses below
--     the drug's reorder_level (only once per crossing)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_pharmacy_apply_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_delta integer;
BEGIN
  -- Recompute batch quantity on_hand from ledger instead of trusting deltas,
  -- so edits/deletes of history are always consistent.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.type = 'adjust' THEN
      UPDATE pharmacy_stock_batches
         SET quantity_on_hand = GREATEST(NEW.quantity, 0)
       WHERE id = NEW.batch_id;
    ELSE
      UPDATE pharmacy_stock_batches
         SET quantity_on_hand = GREATEST(
               quantity_on_hand + (CASE WHEN NEW.type IN ('in','transfer_in') THEN NEW.quantity
                                        ELSE -NEW.quantity END), 0)
       WHERE id = NEW.batch_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- undo the ledger effect of the deleted movement row
    UPDATE pharmacy_stock_batches
       SET quantity_on_hand = GREATEST(
             quantity_on_hand - (CASE WHEN OLD.type IN ('in','transfer_in') THEN OLD.quantity
                                      ELSE -OLD.quantity END), 0)
     WHERE id = OLD.batch_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE pharmacy_stock_batches SET updated_at = now() WHERE id = NEW.batch_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_apply_movement ON pharmacy_stock_movements;
CREATE TRIGGER trg_pharmacy_apply_movement
  AFTER INSERT OR UPDATE OR DELETE ON pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_apply_movement();

-- low stock notification — fire when the *net stock* for a drug drops to or
-- below its reorder level (broadcast to all staff of the tenant via
-- notifications with reference_type='pharmacy_drug'). reorder level is read
-- from pharmacy_drugs (not passed as trigger arg, so it stays up-to-date).
CREATE OR REPLACE FUNCTION fn_notify_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_drug      record;
  v_reorder   integer;
  v_current   integer;
BEGIN
  SELECT name, reorder_level INTO v_drug
    FROM pharmacy_drugs
   WHERE id = NEW.drug_id;

  v_reorder := COALESCE(v_drug.reorder_level, 0);

  -- Fire only on a fresh crossing below the reorder level, not on every
  -- update while stock stays low and not when stock rises back above it.
  IF (NEW.quantity_on_hand >= v_reorder
      OR (TG_OP = 'UPDATE' AND OLD.quantity_on_hand <= v_reorder))
  THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_current := NEW.quantity_on_hand;

  INSERT INTO notifications (tenant_id, channel, event, title, message, reference_type, reference_id)
  VALUES (
    NEW.tenant_id,
    'in_app',
    'low_stock',
    'Low stock alert',
    'Stock for ' || COALESCE(v_drug.name, 'drug') || ' is at ' || v_current || ' (reorder level ' || v_reorder || ')',
    'pharmacy_drug',
    NEW.drug_id
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_low_stock ON pharmacy_stock_batches;
CREATE TRIGGER trg_pharmacy_low_stock
  AFTER INSERT OR UPDATE OF quantity_on_hand ON pharmacy_stock_batches
  FOR EACH ROW EXECUTE FUNCTION fn_notify_low_stock();

-- REVOKE write on the ledger from service role only (defensive; the app uses
-- the API layer service client)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION search_pharmacy_drugs(uuid, text, text, uuid) TO authenticated;

-- ============================================================================
-- 9. SAMPLE SEED — real items from the med dataset (scripts/medications-seed.json)
--    Each tenant onboards by running its own copy; these use a placeholder
--    tenant UUID — replace before applying.
-- ============================================================================
-- Sample values aligned with the current test tenant (Liamsfield):
--   TENANT  = fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3
--   BRANCH  = NULL (shared/central stock)

INSERT INTO pharmacy_drugs (id, tenant_id, branch_id, name, generic_name, brand, category, form, dosage, wholesale_price, unit_price, reorder_level, reorder_qty, requires_rx, is_controlled, nafdac_number)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Amatem 80/480mg Softgel Capsules x10', 'Artemether/Lumefantrine', 'Amatem', 'Antimalarials', 'softgel', '80/480mg', 2400, 3470, 20, 100, true, false, '04-1234-ABCD'),
  ('11111111-1111-4111-8111-111111111112', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Emzor Paracetamol 500mg Tablets x32', 'Paracetamol', 'Emzor', 'Analgesics', 'tablet', '500mg', 1100, 1700, 30, 200, false, false, '04-1234-ABCE'),
  ('11111111-1111-4111-8111-111111111113', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Augmentin 625mg Tablets x14', 'Amoxicillin/Clavulanic Acid', 'Augustin', 'Antibiotics', 'tablet', '625mg', 11300, 15890, 15, 100, true, false, '04-1234-ABCF'),
  ('11111111-1111-4111-8111-111111111114', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Ciprotab 500mg Tablets x10', 'Ciprofloxacin', 'Ciprotab', 'Antibiotics', 'tablet', '500mg', 4200, 5620, 20, 100, true, false, NULL),
  ('11111111-1111-4111-8111-111111111115', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Atacand 16mg Tablets x28', 'Candesartan Cilexetil', 'Atacand', 'Antihypertensives', 'tablet', '16mg', 38000, 50420, 10, 50, true, false, NULL),
  ('11111111-1111-4111-8111-111111111116', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Coartem 20/120mg Tablets x8', 'Artemether/Lumefantrine', 'Coartem', 'Antimalarials', 'tablet', '20/120mg', 3400, 5000, 25, 150, true, false, NULL),
  ('11111111-1111-4111-8111-111111111117', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Metformin 500mg Tablets x30', 'Metformin', 'Generic', 'Diabetes', 'tablet', '500mg', 1500, 2200, 40, 300, true, false, NULL),
  ('11111111-1111-4111-8111-111111111118', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL,
   'Amlodipine 5mg Tablets x30', 'Amlodipine', 'Generic', 'Antihypertensives', 'tablet', '5mg', 1000, 1500, 40, 300, true, false, NULL)
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO pharmacy_suppliers (id, tenant_id, branch_id, name, code, contact_person, phone, email, address, nafdac_license, payment_terms)
VALUES
  ('22222222-2222-4222-8222-222222222221', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL, 'Emzor Pharmaceuticals', 'EMZ-001', 'Chukwuemeka Okeke', '+234 803 555 9101', 'sales@emzor.com.ng', 'Plot 12, Illesha Road, Lagos', 'NAFDAC-EMZ-002145', 'net 30'),
  ('22222222-2222-4222-8222-222222222222', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL, 'GlaxoSmithKline Nigeria', 'GSK-01', 'Adaeze Nwosu', '+234 802 555 2203', 'nigeria.orders@gsk.com', '28 Lekki Phase 1, Lagos', 'NAFDAC-GSK-008204', 'net 45'),
  ('22222222-2222-4222-8222-222222222223', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', NULL, 'May & Baker Nigeria PLC', 'MBPL', 'Yemisi Adeyemi', '+234 808 555 3388', 'callcentre@maybakerng.com', 'Ikorodu Road, Lagos', 'NAFDAC-MB-007711', 'net 30')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO pharmacy_stock_batches (id, tenant_id, drug_id, branch_id, supplier_id, batch_number, expiry_date, quantity_on_hand, cost_price, location, received_at)
VALUES
  ('33333333-3333-4333-8333-333333333301', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', '11111111-1111-4111-8111-111111111111', NULL, '22222222-2222-4222-8222-222222222221', 'AM-2026-01', '2027-06-30', 120, 2400, 'Shelf A-12', now() - interval '10 days'),
  ('33333333-3333-4333-8333-333333333302', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', '11111111-1111-4111-8111-111111111112', NULL, '22222222-2222-4222-8222-222222222221', 'EMZ-555-01', '2027-03-15', 500, 1100, 'Shelf A-03', now() - interval '5 days'),
  ('33333333-3333-4333-8333-333333333303', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', '11111111-1111-4111-8111-111111111113', NULL, '22222222-2222-4222-8222-222222222222', 'AUG-625-08', '2026-09-30', 45, 11300, 'Shelf B-21 (cold)', now() - interval '8 days'),
  ('33333333-3333-4333-8333-333333333304', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', '11111111-1111-4111-8111-111111111117', NULL, '22222222-2222-4222-8222-222222222223', 'MB-3366', '2027-01-31', 0, 1500, 'Shelf B-02', now() - interval '15 days')
ON CONFLICT (branch_id, batch_number, drug_id) DO NOTHING;

-- Example ledger: receive stock into Amatem batch (batch 333...301) and
-- Emzor Paracetamol (batch 333...302). Fixed movement ids keep the seed
-- idempotent (the apply-movement trigger must not fire twice).
INSERT INTO pharmacy_stock_movements (id, tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes)
VALUES
  ('44444444-4444-4444-8444-444444444401', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333301', NULL, 'in', 120, 'PO-2026-0001', 'Initial GRN from Emzor'),
  ('44444444-4444-4444-8444-444444444402', 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3', '11111111-1111-4111-8111-111111111112', '33333333-3333-4333-8333-333333333302', NULL, 'in', 500, 'PO-2026-0002', 'Initial GRN from Emzor')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 10. NICE-TO-HAVE: dispensed-from-expired guard
--     BEFORE INSERT on pharmacy_stock_movements: refuse 'dispense' rows that
--     reference an expired batch.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_pharmacy_reject_expired_dispense()
RETURNS TRIGGER AS $$
DECLARE v_expired boolean;
BEGIN
  IF NEW.type = 'dispense' AND NEW.batch_id IS NOT NULL THEN
    SELECT (expiry_date < CURRENT_DATE) INTO v_expired
      FROM pharmacy_stock_batches
     WHERE id = NEW.batch_id;
    IF v_expired THEN
      RAISE EXCEPTION 'Cannot dispense from expired batch % (expired %)', NEW.batch_id,
        (SELECT expiry_date FROM pharmacy_stock_batches WHERE id = NEW.batch_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_reject_expired_dispense ON pharmacy_stock_movements;
CREATE TRIGGER trg_pharmacy_reject_expired_dispense
  BEFORE INSERT ON pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_reject_expired_dispense();