-- ============================================================================
-- SKYCARE — MIGRATION 0031: PHARMACY AI ENGINE
--
-- Deterministic, tenant-aware intelligence — no external model required:
--
--   1. DRUG RECOMMENDATION  — diagnosis keywords -> therapeutic category ->
--      in-tenant catalog ranked by (rule priority, co-prescription history,
--      live stock).
--   2. OUT-OF-STOCK ALTERNATIVES — same category/form candidates;
--      generic-family (brand swap) first, in stock first.
--   3. INTERACTION CHECK — curated generic-pair KB (generic-name keyed, so
--      it resolves against every tenant's catalog automatically).
--   4. SMART PRICING — Nigerian retail margin bands per category scaled
--      from wholesale / last batch cost.
--
-- Deploy: `npx supabase db push --linked --yes`. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DIAGNOSIS -> THERAPEUTIC CATEGORY RULES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_diag_rules (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform default
  keywords  text[] NOT NULL,
  category  text NOT NULL,
  priority  integer NOT NULL DEFAULT 50,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_diag_rules_tenant
  ON pharmacy_diag_rules (tenant_id, priority DESC);

-- ---------------------------------------------------------------------------
-- 2. INTERACTION KNOWLEDGE BASE — generic-name keyed (tenant-neutral).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_interactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform default
  drug_a_generic  text NOT NULL,
  drug_b_generic  text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('major','moderate','minor')),
  effect          text NOT NULL,
  advice          text,
  source          text NOT NULL DEFAULT 'community',
  is_active       boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_interaction_pair
  ON pharmacy_interactions (
    LEAST(LOWER(drug_a_generic), LOWER(drug_b_generic)),
    GREATEST(LOWER(drug_a_generic), LOWER(drug_b_generic))
  );
CREATE INDEX IF NOT EXISTS idx_pharmacy_interactions_active
  ON pharmacy_interactions (is_active);

-- ---------------------------------------------------------------------------
-- 3. MARGIN BENCHMARKS — typical NG community-pharmacy gross margins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_margin_benchmarks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform default
  category        text NOT NULL,
  margin_low_pct  numeric(5,2) NOT NULL DEFAULT 20,
  margin_high_pct numeric(5,2) NOT NULL DEFAULT 45,
  source          text NOT NULL DEFAULT 'ng-pharmacy-benchmark'
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_margin_tenant ON pharmacy_margin_benchmarks (tenant_id, category);

-- ---------------------------------------------------------------------------
-- SEED — platform-wide rows (tenant_id NULL)
-- ---------------------------------------------------------------------------
INSERT INTO pharmacy_diag_rules (keywords, category, priority) VALUES
  (ARRAY['malaria','plasmodium','fever with chills','rigors'],                       'Antimalarials', 100),
  (ARRAY['typhoid','enteric fever','salmonella'],                                   'Antibiotics', 95),
  (ARRAY['pneumonia','bronchitis','chest infection','respiratory infection'],       'Antibiotics', 90),
  (ARRAY['uti','urinary tract infection','dysuria','cystitis'],                     'Antibiotics', 90),
  (ARRAY['diabetes','type 2 diabetes','hyperglycemia','hyperglycaemia'],            'Diabetes', 90),
  (ARRAY['hypertension','high blood pressure','hbp'],                               'Antihypertensives', 90),
  (ARRAY['asthma','copd','wheeze','bronchospasm'],                                  'Respiratory', 85),
  (ARRAY['ulcer','gastritis','gerd','heartburn','dyspepsia'],                       'Gastrointestinal', 85),
  (ARRAY['pain','headache','migraine','arthralgia','arthritis','muscle pain'],      'Analgesics', 80),
  (ARRAY['vitamin deficiency','supplement','anaemia','iron deficiency','vitamins'], 'Vitamins & Supplements', 70)
ON CONFLICT DO NOTHING;

INSERT INTO pharmacy_interactions
  (drug_a_generic, drug_b_generic, severity, effect, advice, source) VALUES
  ('Artemether/Lumefantrine', 'Quinine',       'major',
   'QT prolongation and raised arrhythmia risk when quinine is combined with artemether/lumefantrine.',
   'Do not combine; use quinine alone or a different ACT.', 'whocc'),
  ('Ibuprofen', 'Warfarin',      'major',
   'Increased risk of serious gastrointestinal bleeding.',
   'Avoid combination; switch to paracetamol or monitor INR closely if unavoidable.', 'whocc'),
  ('Aspirin', 'Warfarin',        'major',
   'Significant additive antiplatelet/anticoagulant effect — bleeding risk.',
   'Monitor INR and signs of bleeding; avoid unless clearly necessary.', 'whocc'),
  ('Warfarin', 'Metronidazole',  'major',
   'Metronidazole inhibits warfarin metabolism — INR rises and bleeding risk.',
   'Monitor INR closely for at least a week after starting metronidazole.', 'whocc'),
  ('Clarithromycin', 'Simvastatin', 'major',
   'Clarithromycin inhibits CYP3A4 — simvastatin levels rise, rhabdomyolysis risk.',
   'Avoid; use azithromycin or suspend the statin during the course.', 'whocc'),
  ('Ciprofloxacin', 'Tizanidine', 'major',
   'Ciprofloxacin strongly raises tizanidine levels — severe hypotension/sedation.',
   'Avoid combination.', 'whocc'),
  ('Ciprofloxacin', 'Metformin',  'moderate',
   'Transport/absorption changes can alter metformin effect.',
   'Monitor blood glucose during concurrent use.', 'whocc'),
  ('Omeprazole', 'Clopidogrel',   'moderate',
   'PPIs inhibit CYP2C19 — reduced clopidogrel activation and efficacy.',
   'Prefer pantoprazole with dual antiplatelet therapy if possible.', 'whocc'),
  ('Amlodipine', 'Simvastatin',   'moderate',
   'Amlodipine raises simvastatin levels, increasing myopathy risk.',
   'Keep simvastatin ≤ 20mg/day when used with amlodipine.', 'whocc'),
  ('Simvastatin', 'Glibenclamide','minor',
   'Simvastatin augments sulfonylurea hypoglycaemia slightly.',
   'Blood-glucose monitoring; standard co-prescription care.', 'community'),
  ('Digoxin', 'Amiodarone',      'major',
   'Amiodarone raises digoxin levels (50-100%) — poisoning risk.',
   'Consider halving digoxin dose; monitor levels/ECG.', 'whocc')
ON CONFLICT DO NOTHING;

INSERT INTO pharmacy_margin_benchmarks (category, margin_low_pct, margin_high_pct) VALUES
  ('Antibiotics',            20, 45),
  ('Antimalarials',          10, 35),
  ('Analgesics',             15, 40),
  ('Antihypertensives',      20, 40),
  ('Diabetes',               15, 35),
  ('Respiratory',            20, 45),
  ('Gastrointestinal',       20, 45),
  ('Vitamins & Supplements', 30, 60),
  ('Dermatology',            25, 55),
  ('Eye Drops',              30, 50),
  ('Ear Drops',              30, 50),
  ('Inhalers',               15, 35),
  ('default',                20, 45)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- RPCs
-- ============================================================================
-- 1. RECOMMEND DRUGS FOR A DIAGNOSIS
--    Score = (200 - rule priority) + 2×tenant co-prescription history + 5 if
--    any unexpired stock. Deterministic, CTE-only, single pass.
CREATE OR REPLACE FUNCTION public.pharmacy_recommend_drugs(
  p_tenant_id uuid,
  p_diagnosis text,
  p_limit     integer DEFAULT 5
)
RETURNS TABLE (
  id             uuid,
  name           text,
  category       text,
  form           text,
  dosage         text,
  unit_price     numeric,
  generic_name   text,
  stock_qty      integer,
  presc_count    integer,
  score          numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH rules AS (
    SELECT r.category, r.priority, r.keywords
    FROM pharmacy_diag_rules r
    WHERE (r.tenant_id = p_tenant_id OR r.tenant_id IS NULL) AND r.is_active
  ),
  matched AS (
    SELECT DISTINCT ON (category) category, priority
    FROM rules
    WHERE EXISTS (
      SELECT 1 FROM unnest(keywords) k
      WHERE position(lower(k) IN lower(p_diagnosis)) > 0
    )
    ORDER BY category, priority
  ),
  history AS (
    SELECT pi.pharmacy_drug_id AS drug_id, COUNT(*)::int AS cnt
    FROM prescription_items pi
    JOIN prescriptions pr ON pr.id = pi.prescription_id
    WHERE pr.tenant_id = p_tenant_id AND pi.pharmacy_drug_id IS NOT NULL
    GROUP BY pi.pharmacy_drug_id
  ),
  stock AS (
    SELECT b.drug_id, COALESCE(SUM(b.quantity_on_hand),0)::int AS qty
    FROM pharmacy_stock_batches b
    WHERE b.expiry_date > CURRENT_DATE
    GROUP BY b.drug_id
  )
  SELECT d.id, d.name, d.category, d.form, d.dosage, d.unit_price, d.generic_name,
         COALESCE(s.qty, 0),
         COALESCE(h.cnt, 0),
         (200 - m.priority) + COALESCE(h.cnt, 0) * 2 + CASE WHEN COALESCE(s.qty,0) > 0 THEN 5 ELSE 0 END
           AS score
  FROM pharmacy_drugs d
  JOIN matched m ON m.category ILIKE d.category
  LEFT JOIN history h ON h.drug_id = d.id
  LEFT JOIN stock s ON s.drug_id = d.id
  WHERE d.tenant_id = p_tenant_id AND d.is_active
  ORDER BY score DESC
  LIMIT LEAST(COALESCE(p_limit, 5), 10);
$$;

-- 2. ALTERNATIVES — same category & same dosage form; generic family first,
--    price proximity tie-breaker, in-stock preference already scored.
CREATE OR REPLACE FUNCTION public.pharmacy_alternatives(
  p_tenant_id uuid,
  p_drug_id   uuid,
  p_limit     integer DEFAULT 5
)
RETURNS TABLE (
  id             uuid,
  name           text,
  generic_name   text,
  form           text,
  dosage         text,
  unit_price     numeric,
  stock_qty      integer,
  same_generic   boolean,
  in_stock       boolean,
  score          numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT category, form, generic_name, unit_price
    FROM pharmacy_drugs WHERE id = p_drug_id AND tenant_id = p_tenant_id
  ),
  stock AS (
    SELECT b.drug_id, COALESCE(SUM(b.quantity_on_hand),0)::int AS qty
    FROM pharmacy_stock_batches b
    WHERE b.expiry_date > CURRENT_DATE
    GROUP BY b.drug_id
  )
  SELECT d.id, d.name, d.generic_name, d.form, d.dosage, d.unit_price,
         COALESCE(s.qty, 0) AS stock_qty,
         COALESCE(d.generic_name, '') LIKE COALESCE(t.generic_name, '') AS same_generic,
         COALESCE(s.qty, 0) > 0 AS in_stock,
         (CASE WHEN COALESCE(s.qty,0) > 0 THEN 100 ELSE 0 END)
       + (CASE WHEN COALESCE(d.generic_name,'') = COALESCE(t.generic_name,'') THEN 50 ELSE 0 END)
       + (CASE WHEN d.unit_price <= t.unit_price * 1.1 THEN 25 ELSE 0 END) AS score
  FROM pharmacy_drugs d
  CROSS JOIN target t
  LEFT JOIN stock s ON s.drug_id = d.id
  WHERE d.tenant_id = p_tenant_id
    AND d.is_active
    AND d.id <> p_drug_id
    AND d.category ILIKE t.category
    AND (t.form IS NULL OR d.form = t.form)
  ORDER BY same_generic DESC, in_stock DESC, score DESC, d.unit_price
  LIMIT LEAST(COALESCE(p_limit, 5), 10);
$$;

-- 3. INTERACTION CHECK — resolve drug ids in this tenant to generics, match
--    curated pairs, return ordered by severity.
CREATE OR REPLACE FUNCTION public.pharmacy_interaction_check(
  p_tenant_id uuid,
  p_drug_ids  uuid[]
)
RETURNS TABLE (
  drug_a_id     uuid,
  drug_b_id     uuid,
  drug_a_name   text,
  drug_b_name   text,
  drug_a_generic text,
  drug_b_generic text,
  severity      text,
  effect        text,
  advice        text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH named AS (
    SELECT id, generic_name, name
    FROM pharmacy_drugs
    WHERE tenant_id = p_tenant_id AND id = ANY(p_drug_ids)
  ),
  expanded AS (
    SELECT a.id AS aid, a.name AS aname, lower(a.generic_name) AS ag, a.generic_name AS agn,
           b.id AS bid, b.name AS bname, lower(b.generic_name) AS bg, b.generic_name AS bgn
    FROM named a
    JOIN named b ON a.id < b.id
  )
  SELECT e.aid, e.bid, e.aname, e.bname, e.agn, e.bgn, i.severity, i.effect, i.advice
  FROM expanded e
  JOIN pharmacy_interactions i
    ON i.is_active
   AND LEAST(LOWER(i.drug_a_generic), LOWER(i.drug_b_generic)) = LEAST(e.ag, e.bg)
   AND GREATEST(LOWER(i.drug_a_generic), LOWER(i.drug_b_generic)) = GREATEST(e.ag, e.bg)
  ORDER BY CASE i.severity WHEN 'major' THEN 0 WHEN 'moderate' THEN 1 ELSE 2 END;
$$;

-- 4. SMART PRICING — margin band from benchmarks, wholesale anchor = latest
--    batch cost (fallback drug wholesale_price).
CREATE OR REPLACE FUNCTION public.pharmacy_suggest_pricing(
  p_tenant_id uuid,
  p_drug_id   uuid
)
RETURNS TABLE (
  wholesale       numeric,
  current_price   numeric,
  margin_low_pct  numeric,
  margin_high_pct numeric,
  suggested_low   numeric,
  suggested_high  numeric,
  category        text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wholesale numeric;
  v_current   numeric;
  v_cat       text;
  v_low       numeric;
  v_high      numeric;
BEGIN
  SELECT d.wholesale_price, d.unit_price, d.category
    INTO v_wholesale, v_current, v_cat
  FROM pharmacy_drugs d
  WHERE d.id = p_drug_id AND d.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(MAX(b.cost_price), v_wholesale) INTO v_wholesale
  FROM pharmacy_stock_batches b
  WHERE b.drug_id = p_drug_id AND b.cost_price > 0;

  SELECT mb.margin_low_pct, mb.margin_high_pct
    INTO v_low, v_high
  FROM pharmacy_margin_benchmarks mb
  WHERE mb.category ILIKE v_cat
  ORDER BY (mb.tenant_id = p_tenant_id) DESC NULLS LAST, mb.category = 'default' DESC
  LIMIT 1;

  IF v_low IS NULL THEN
    v_low  := 20; v_high := 45;
  END IF;

  RETURN QUERY
  SELECT v_wholesale, v_current, v_low, v_high,
         round(v_wholesale * (100 + v_low) / 100, 2),
         round(v_wholesale * (100 + v_high) / 100, 2),
         v_cat;
END;
$$;

-- GRANTS — staff-only via authenticated; RLS is bypassed (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.pharmacy_recommend_drugs(uuid, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pharmacy_alternatives(uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pharmacy_interaction_check(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pharmacy_suggest_pricing(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.pharmacy_recommend_drugs(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_alternatives(uuid, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_interaction_check(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_suggest_pricing(uuid, uuid) TO authenticated;