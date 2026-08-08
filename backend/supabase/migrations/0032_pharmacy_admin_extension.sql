-- ============================================================================
-- SKYCARE — MIGRATION 0032: PHARMACY ADMIN EXTENSION
--
-- Purpose: let hospitals administer their own pharmacy catalogue —
--   1. flexible category dictionary (tenant can extend the platform families)
--   2. strict no-duplicate enforcement (case/whitespace-insensitive) via
--      a normalized name column + unique indexes + input trigger
--   3. multi-branch pricing: pharmacy_price_overrides with NULL branch =
--      "all branches" base; pharmacy_effective_price() resolves the chain
--      branch override -> base override -> drug.unit_price
--   4. auto-registration of any new category a hospital invents on the fly
--
-- CSV import itself lives in the API layer (parses, validates, reports); this
-- migration only supplies the uniqueness/category machinery it relies on.
--
-- Idempotent. Deploy: `npx supabase db push --linked --yes`
-- ============================================================================

-- ============================================================================
-- 1. pharmacy_categories — hospital-extensible category dictionary
--    tenant_id NULL = platform family (readable by every tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pharmacy_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform defaults
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text,
  color       text,                   -- optional display colour (hex)
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE(tenant_id,name) lets NULL rows multiply; scope it explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_categories_scope
  ON pharmacy_categories (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

-- platform families (stay in sync with 0031 margin benchmarks)
INSERT INTO pharmacy_categories (tenant_id, name, description, color)
VALUES
  (NULL, 'Antibiotics',            'Penicillins, cephalosporins, macrolides, fluoroquinolones', '#0ea5e9'),
  (NULL, 'Antimalarials',          'ACTs, quinine and other antimalarial therapy',              '#16a34a'),
  (NULL, 'Analgesics',             'Pain relief from paracetamol to opioids',                   '#ea580c'),
  (NULL, 'Antihypertensives',      'Blood pressure control medicines',                          '#7c3aed'),
  (NULL, 'Diabetes',               'Insulin, metformin and other glucose management',           '#2563eb'),
  (NULL, 'Respiratory',            'Inhalers, bronchodilators, COPD care',                      '#0891b2'),
  (NULL, 'Gastrointestinal',       'Ulcer, reflux and dyspepsia therapy',                       '#ca8a04'),
  (NULL, 'Vitamins & Supplements', 'Multivitamins, iron, folate and minerals',                  '#65a30d'),
  (NULL, 'Dermatology',            'Creams, ointments and topical care',                        '#a21caf'),
  (NULL, 'Eye Drops',              'Ophthalmic preparations',                                   '#0284c7'),
  (NULL, 'Ear Drops',              'Otic preparations',                                         '#0d9488'),
  (NULL, 'Inhalers',               'Metered dose and dry powder inhalers',                      '#4f46e5')
ON CONFLICT ((COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)), lower(btrim(name))) DO NOTHING;

ALTER TABLE pharmacy_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_categories_staff_read ON pharmacy_categories;
CREATE POLICY pharmacy_categories_staff_read ON pharmacy_categories FOR SELECT
  USING (is_staff() AND (tenant_id IS NULL OR tenant_id = get_tenant_id()) OR is_super_admin());

GRANT SELECT ON pharmacy_categories TO authenticated;

-- ============================================================================
-- 2. NO-DUPLICATE NAMES — normalized (lowercase, trimmed) unique per tenant
--    pharmacy_drugs + pharmacy_suppliers; backfills any accidental dups with
--    " (2)", " (3)" suffixes so the unique index can be created safely.
-- ============================================================================
ALTER TABLE pharmacy_drugs ADD COLUMN IF NOT EXISTS name_normalized text;
ALTER TABLE pharmacy_suppliers ADD COLUMN IF NOT EXISTS name_normalized text;

DO $$
DECLARE
  v_drug RECORD;
  v_sup  RECORD;
  v_row  RECORD;
  v_idx  int;
BEGIN
  -- pharmacy_drugs
  UPDATE pharmacy_drugs SET name_normalized = lower(btrim(name)) WHERE name_normalized IS NULL;
  FOR v_drug IN
    SELECT tenant_id, name_normalized, array_agg(id ORDER BY created_at, id) AS ids
    FROM pharmacy_drugs
    WHERE name_normalized IS NOT NULL
    GROUP BY tenant_id, name_normalized
    HAVING count(*) > 1
  LOOP
    v_idx := 2;
    FOR v_row IN 2..array_upper(v_drug.ids, 1) LOOP
      UPDATE pharmacy_drugs
         SET name_normalized = v_drug.name_normalized || ' (' || v_idx || ')'
       WHERE id = v_drug.ids[v_row];
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;

  -- pharmacy_suppliers
  UPDATE pharmacy_suppliers SET name_normalized = lower(btrim(name)) WHERE name_normalized IS NULL;
  FOR v_sup IN
    SELECT tenant_id, name_normalized, array_agg(id ORDER BY created_at, id) AS ids
      FROM pharmacy_suppliers
     WHERE name_normalized IS NOT NULL
     GROUP BY tenant_id, name_normalized
     HAVING count(*) > 1
  LOOP
    v_idx := 2;
    FOR v_row IN 2..array_upper(v_sup.ids, 1) LOOP
      UPDATE pharmacy_suppliers
         SET name_normalized = v_sup.name_normalized || ' (' || v_idx || ')'
       WHERE id = v_sup.ids[v_row];
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_drugs_name_norm
  ON pharmacy_drugs (tenant_id, name_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_suppliers_name_norm
  ON pharmacy_suppliers (tenant_id, name_normalized);

-- keep the normalized column in sync on every name change
CREATE OR REPLACE FUNCTION fn_pharmacy_normalize_drug_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name_normalized := lower(btrim(NEW.name));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_drugs_normalize ON pharmacy_drugs;
CREATE TRIGGER trg_pharmacy_drugs_normalize
  BEFORE INSERT OR UPDATE OF name ON pharmacy_drugs
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_normalize_drug_name();

DROP TRIGGER IF EXISTS trg_pharmacy_suppliers_normalize ON pharmacy_suppliers;
CREATE TRIGGER trg_pharmacy_suppliers_normalize
  BEFORE INSERT OR UPDATE OF name ON pharmacy_suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_normalize_drug_name();

-- ============================================================================
-- 3. FLEXIBLE CATEGORY AUTO-REGISTRATION
--    Whenever a hospital writes a category that does not exist yet, the
--    trigger adds it to their tenant category list (ON CONFLICT safe).
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_pharmacy_register_category()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pharmacy_categories (tenant_id, name)
  VALUES (NEW.tenant_id, NEW.category)
  ON CONFLICT ((COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)), lower(btrim(name))) DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pharmacy_drugs_register_category ON pharmacy_drugs;
CREATE TRIGGER trg_pharmacy_drugs_register_category
  AFTER INSERT OR UPDATE OF category ON pharmacy_drugs
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_register_category();

-- ============================================================================
-- 4. MULTI-BRANCH PRICING — pharmacy_price_overrides
--    branch_id NULL = base price applied to branches without their own row.
--    Resolution: branch row -> base row -> drug.unit_price.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pharmacy_price_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  drug_id     uuid NOT NULL REFERENCES pharmacy_drugs(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE CASCADE, -- NULL = base for all branches
  unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_price_override_scope
  ON pharmacy_price_overrides (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), drug_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_price_drug_branch
  ON pharmacy_price_overrides (drug_id, branch_id);

ALTER TABLE pharmacy_price_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_price_overrides_staff_read ON pharmacy_price_overrides;
CREATE POLICY pharmacy_price_overrides_staff_read ON pharmacy_price_overrides FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_staff() OR is_super_admin());

GRANT SELECT ON pharmacy_price_overrides TO authenticated;

-- effective price resolution: branch override -> base override -> retail price
CREATE OR REPLACE FUNCTION pharmacy_effective_price(p_drug uuid, p_branch uuid)
RETURNS numeric(12,2) LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT unit_price FROM pharmacy_price_overrides WHERE drug_id = p_drug AND branch_id = p_branch),
    (SELECT unit_price FROM pharmacy_price_overrides WHERE drug_id = p_drug AND branch_id IS NULL),
    (SELECT unit_price FROM pharmacy_drugs WHERE id = p_drug),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION pharmacy_effective_price(uuid, uuid) TO authenticated;