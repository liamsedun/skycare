-- 0018: Lab catalog + requests schema (normalized lab module, v2).
--
-- Idempotent: safe to re-run whether or not the v1 of this file was applied.
-- Conventions: "hospital" = tenants (tenant_id) + branch_id; statuses reuse
-- lab_order_status; mutable tables carry updated_at via update_timestamp().
--
-- v2 adds:
--   * seed catalog (11 categories / 50 services, lab + imaging)
--   * custom-service workflow (approval_status, created_by/approved_by,
--     external_lab_id for external-lab-defined services)
--   * case-insensitive duplicate prevention per hospital
--   * AFTER INSERT trigger on tenants so every new hospital gets the catalog

-- ---------------------------------------------------------------------------
-- LAB CATEGORIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lab_categories_tenant UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_lab_categories_tenant ON lab_categories (tenant_id);

-- ---------------------------------------------------------------------------
-- LAB SERVICES (catalog + custom). is_custom + approval_status drive the
-- user-defined workflow; external_lab_id marks services from an external lab.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES lab_categories(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  type            text NOT NULL DEFAULT 'lab' CHECK (type IN ('lab', 'imaging')),
  is_custom       boolean NOT NULL DEFAULT false,
  external_lab_id text,
  approval_status text NOT NULL DEFAULT 'approved'
                  CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  approved_at     timestamptz,
  approved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  reference_range text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lab_services_tenant UNIQUE (tenant_id, name)
);

-- v1 applied without the new columns? Add them.
ALTER TABLE lab_services ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;
ALTER TABLE lab_services ADD COLUMN IF NOT EXISTS external_lab_id text;
ALTER TABLE lab_services ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
  CHECK (approval_status IN ('approved', 'pending', 'rejected'));
ALTER TABLE lab_services ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE lab_services ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE lab_services ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Case-insensitive duplicate prevention per hospital (Glucose != glucose).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_services_tenant_name_ci
  ON lab_services (tenant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_lab_services_tenant   ON lab_services (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_services_category ON lab_services (category_id);
CREATE INDEX IF NOT EXISTS idx_lab_services_type     ON lab_services (tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_lab_services_approval ON lab_services (tenant_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_lab_services_custom   ON lab_services (tenant_id, is_custom);
CREATE INDEX IF NOT EXISTS idx_lab_services_external ON lab_services (tenant_id)
  WHERE external_lab_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- LAB REQUESTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  status          lab_order_status NOT NULL DEFAULT 'requested',
  is_external     boolean NOT NULL DEFAULT false,
  external_lab_id text,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  notes           text,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_requests_tenant   ON lab_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_requests_patient  ON lab_requests (patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_requests_doctor   ON lab_requests (doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_requests_external ON lab_requests (external_lab_id) WHERE is_external;
CREATE INDEX IF NOT EXISTS idx_lab_requests_requested ON lab_requests (requested_at DESC);

-- ---------------------------------------------------------------------------
-- LAB REQUEST ITEMS (service_name snapshots the catalog name)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_request_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  service_id   uuid REFERENCES lab_services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  priority     text NOT NULL DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat')),
  sample_type  text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_request_items_request ON lab_request_items (request_id);
CREATE INDEX IF NOT EXISTS idx_lab_request_items_service ON lab_request_items (service_id);

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_lab_categories_updated_at ON lab_categories;
CREATE TRIGGER trg_lab_categories_updated_at BEFORE UPDATE ON lab_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
DROP TRIGGER IF EXISTS trg_lab_services_updated_at ON lab_services;
CREATE TRIGGER trg_lab_services_updated_at BEFORE UPDATE ON lab_services
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
DROP TRIGGER IF EXISTS trg_lab_requests_updated_at ON lab_requests;
CREATE TRIGGER trg_lab_requests_updated_at BEFORE UPDATE ON lab_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- ---------------------------------------------------------------------------
-- CATALOG SEED — full lab + imaging service list, provisioned per hospital
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_lab_catalog(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s text[];
BEGIN
  INSERT INTO lab_categories (tenant_id, name)
  SELECT p_tenant_id, c
  FROM (VALUES
    ('Hematology'), ('Biochemistry'), ('Microbiology'), ('Serology / Immunology'),
    ('Urinalysis & Stool'), ('Histopathology'), ('Molecular / Advanced'),
    ('Radiology'), ('Ultrasound'), ('Cardiology Imaging'), ('Other Imaging')
  ) AS v(c)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  FOREACH s IN ARRAY ARRAY[
    -- A. Hematology
    ARRAY['Hematology','lab','Complete Blood Count (CBC)'],
    ARRAY['Hematology','lab','ESR (Erythrocyte Sedimentation Rate)'],
    ARRAY['Hematology','lab','Hemoglobin (Hb)'],
    ARRAY['Hematology','lab','Packed Cell Volume (PCV)'],
    ARRAY['Hematology','lab','Blood Group & Rh Factor'],
    ARRAY['Hematology','lab','Coagulation Profile (PT, INR, aPTT)'],
    ARRAY['Hematology','lab','Platelet Count'],
    -- B. Biochemistry
    ARRAY['Biochemistry','lab','Blood Glucose (Fasting / Random / HbA1c)'],
    ARRAY['Biochemistry','lab','Lipid Profile'],
    ARRAY['Biochemistry','lab','Liver Function Test (LFT)'],
    ARRAY['Biochemistry','lab','Kidney Function Test (KFT)'],
    ARRAY['Biochemistry','lab','Electrolytes (Na, K, Cl)'],
    ARRAY['Biochemistry','lab','Uric Acid'],
    ARRAY['Biochemistry','lab','Calcium / Magnesium / Phosphate'],
    ARRAY['Biochemistry','lab','Cardiac Enzymes (Troponin, CK-MB)'],
    -- C. Microbiology
    ARRAY['Microbiology','lab','Blood Culture'],
    ARRAY['Microbiology','lab','Urine Culture'],
    ARRAY['Microbiology','lab','Stool Culture'],
    ARRAY['Microbiology','lab','Sputum Culture'],
    ARRAY['Microbiology','lab','Wound Swab'],
    ARRAY['Microbiology','lab','Sensitivity Testing'],
    -- D. Serology / Immunology
    ARRAY['Serology / Immunology','lab','HIV Test'],
    ARRAY['Serology / Immunology','lab','Hepatitis B / C'],
    ARRAY['Serology / Immunology','lab','Malaria Parasite Test'],
    ARRAY['Serology / Immunology','lab','Typhoid (Widal)'],
    ARRAY['Serology / Immunology','lab','COVID-19 Test'],
    ARRAY['Serology / Immunology','lab','Pregnancy Test (HCG)'],
    -- E. Urinalysis & Stool
    ARRAY['Urinalysis & Stool','lab','Urinalysis (Routine)'],
    ARRAY['Urinalysis & Stool','lab','Stool Analysis'],
    ARRAY['Urinalysis & Stool','lab','Occult Blood Test'],
    -- F. Histopathology
    ARRAY['Histopathology','lab','Biopsy Analysis'],
    ARRAY['Histopathology','lab','Cytology (Pap Smear)'],
    ARRAY['Histopathology','lab','Tissue Examination'],
    -- G. Molecular / Advanced
    ARRAY['Molecular / Advanced','lab','PCR Tests'],
    ARRAY['Molecular / Advanced','lab','DNA Testing'],
    ARRAY['Molecular / Advanced','lab','Genetic Screening'],
    -- H. Imaging
    ARRAY['Radiology','imaging','X-Ray (Chest, Limb, etc.)'],
    ARRAY['Radiology','imaging','CT Scan'],
    ARRAY['Radiology','imaging','MRI Scan'],
    ARRAY['Ultrasound','imaging','Abdominal Ultrasound'],
    ARRAY['Ultrasound','imaging','Pelvic Ultrasound'],
    ARRAY['Ultrasound','imaging','Obstetric Scan'],
    ARRAY['Cardiology Imaging','imaging','ECG'],
    ARRAY['Cardiology Imaging','imaging','Echocardiogram'],
    ARRAY['Cardiology Imaging','imaging','Stress Test'],
    ARRAY['Other Imaging','imaging','Mammography'],
    ARRAY['Other Imaging','imaging','Doppler Scan'],
    ARRAY['Other Imaging','imaging','Endoscopy'],
    ARRAY['Other Imaging','imaging','Colonoscopy']
  ] LOOP
    INSERT INTO lab_services (tenant_id, category_id, name, type, price, reference_range, is_active, is_custom, approval_status)
    SELECT p_tenant_id, c.id, s[3], s[2], 0, NULL, true, false, 'approved'
    FROM lab_categories c
    WHERE c.tenant_id = p_tenant_id AND c.name = s[1]
    ON CONFLICT (tenant_id, name) DO NOTHING;
  END LOOP;
END $$;

-- Provision existing hospitals, then auto-provision new ones.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_lab_catalog(t.id);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_lab_catalog ON tenants;
CREATE TRIGGER trg_tenants_lab_catalog AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_lab_catalog(NEW.id);

-- ---------------------------------------------------------------------------
-- RLS (staff manage in-tenant; patients read their own/family requests only)
-- ---------------------------------------------------------------------------
ALTER TABLE lab_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_categories_staff ON lab_categories;
CREATE POLICY lab_categories_staff ON lab_categories
  FOR ALL
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

DROP POLICY IF EXISTS lab_services_staff ON lab_services;
CREATE POLICY lab_services_staff ON lab_services
  FOR ALL
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

DROP POLICY IF EXISTS lab_requests_staff ON lab_requests;
CREATE POLICY lab_requests_staff ON lab_requests
  FOR ALL
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

DROP POLICY IF EXISTS lab_requests_self ON lab_requests;
CREATE POLICY lab_requests_self ON lab_requests FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));

DROP POLICY IF EXISTS lab_request_items_staff ON lab_request_items;
CREATE POLICY lab_request_items_staff ON lab_request_items
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id()
      AND (is_staff() OR is_super_admin())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id()
      AND (is_staff() OR is_super_admin())));

DROP POLICY IF EXISTS lab_request_items_self ON lab_request_items;
CREATE POLICY lab_request_items_self ON lab_request_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id() AND is_patient()
      AND lr.patient_id = ANY (public.family_patient_ids())));
