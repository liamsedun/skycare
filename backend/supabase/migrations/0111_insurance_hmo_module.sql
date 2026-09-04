-- 0111: Insurance / HMO / NHIA module
-- Tables: insurance_providers, insurance_policies, insurance_coverage_rules,
--         insurance_authorizations, hmo_claims (universal), hmo_encounters
-- Plus: auto-numbering RPC, RLS, seed triggers.

-- ============================================================
-- 0. Create is_hmo_officer() RLS helper if missing
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_hmo_officer') THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION public.is_hmo_officer() RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT get_role() IN (''super_admin'', ''hospital_admin'', ''hmo_officer'') $f$';
  END IF;
END $$;

-- Also ensure hmo_officer is in is_staff() for read access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'is_staff'
    AND pg_get_functiondef(oid) LIKE '%hmo_officer%'
  ) THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT get_role() IN (''hospital_admin'',''doctor'',''nurse'',''pharmacist'',''lab_tech'',''cashier'',''receptionist'',''hmo_officer'') $f$';
  END IF;
END $$;

-- ============================================================
-- 1. insurance_providers  (HMO / NHIA directory)
-- ============================================================
CREATE TABLE IF NOT EXISTS insurance_providers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  code          text,
  provider_type text NOT NULL CHECK (provider_type IN ('nhia','hmo','private')),
  contact_name  text,
  contact_phone text,
  contact_email text,
  address       text,
  payment_terms_days integer NOT NULL DEFAULT 30,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_insurance_providers_tenant ON insurance_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_insurance_providers_active ON insurance_providers(tenant_id, is_active) WHERE is_active;

-- ============================================================
-- 2. insurance_policies  (patient enrollment)
-- ============================================================
CREATE TABLE IF NOT EXISTS insurance_policies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id           uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id          uuid NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  policy_number        text NOT NULL,
  plan_name            text,
  coverage_type        text NOT NULL CHECK (coverage_type IN ('full','partial','co-pay')),
  co_pay_percent       numeric(5,2) CHECK (co_pay_percent >= 0 AND co_pay_percent <= 100),
  co_pay_amount        numeric(12,2) CHECK (co_pay_amount >= 0),
  effective_date       date NOT NULL,
  expiry_date          date,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','terminated')),
  dependants_covered   integer NOT NULL DEFAULT 0 CHECK (dependants_covered >= 0),
  is_primary           boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, patient_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_tenant ON insurance_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_patient ON insurance_policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_active ON insurance_policies(tenant_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_insurance_policies_provider ON insurance_policies(provider_id);

-- ============================================================
-- 3. insurance_coverage_rules  (per insurer × service type)
-- ============================================================
CREATE TABLE IF NOT EXISTS insurance_coverage_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_id           uuid NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  service_type          text NOT NULL CHECK (service_type IN ('consultation','lab_test','procedure','drug','ward','maternity','emergency','diagnostic','other')),
  service_id            uuid,
  tariff_code           text,
  tariff_name           text,
  covered_amount        numeric(12,2),
  coverage_percent      numeric(5,2) CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
  co_pay_amount         numeric(12,2) CHECK (co_pay_amount >= 0),
  requires_authorization boolean NOT NULL DEFAULT false,
  max_claims_per_year   integer,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id, service_type, service_id)
);

CREATE INDEX IF NOT EXISTS idx_coverage_rules_tenant ON insurance_coverage_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coverage_rules_provider ON insurance_coverage_rules(provider_id);
CREATE INDEX IF NOT EXISTS idx_coverage_rules_service ON insurance_coverage_rules(service_type);

-- ============================================================
-- 4. insurance_authorizations  (pre-auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS insurance_authorizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id           uuid NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  policy_id             uuid NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  authorization_number  text,
  service_type          text NOT NULL,
  service_description   text,
  estimated_amount      numeric(12,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','used')),
  approved_amount       numeric(12,2),
  valid_until           date,
  notes                 text,
  requested_by          uuid REFERENCES users(id),
  approved_by           uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_authorizations_tenant ON insurance_authorizations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_authorizations_patient ON insurance_authorizations(patient_id);
CREATE INDEX IF NOT EXISTS idx_authorizations_status ON insurance_authorizations(status);
CREATE INDEX IF NOT EXISTS idx_authorizations_pending ON insurance_authorizations(tenant_id, status) WHERE status = 'pending';

-- ============================================================
-- 5. hmo_claims  (universal — central billing + pharmacy)
-- ============================================================
CREATE TABLE IF NOT EXISTS hmo_claims (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id             uuid REFERENCES branches(id) ON DELETE SET NULL,
  claim_number          text NOT NULL,
  invoice_id            uuid REFERENCES invoices(id) ON DELETE SET NULL,
  pharmacy_invoice_id   uuid,
  patient_id            uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id           uuid NOT NULL REFERENCES insurance_providers(id) ON DELETE CASCADE,
  policy_id             uuid REFERENCES insurance_policies(id) ON DELETE SET NULL,
  authorization_id      uuid REFERENCES insurance_authorizations(id) ON DELETE SET NULL,
  encounter_date        date NOT NULL DEFAULT CURRENT_DATE,
  encounter_type        text NOT NULL CHECK (encounter_type IN ('outpatient','inpatient','emergency','pharmacy','lab','maternity','other')),
  diagnosis_code        text,
  diagnosis_description text,
  service_code          text,
  items                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_billed          numeric(12,2) NOT NULL DEFAULT 0,
  total_covered         numeric(12,2) NOT NULL DEFAULT 0,
  total_co_pay          numeric(12,2) NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','submitted','adjudicated','approved','partially_approved','rejected','paid','appealed')),
  submitted_at          timestamptz,
  processed_at          timestamptz,
  paid_at               timestamptz,
  payment_reference     text,
  notes                 text,
  created_by            uuid REFERENCES users(id),
  processed_by          uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, claim_number)
);

CREATE INDEX IF NOT EXISTS idx_hmo_claims_tenant ON hmo_claims(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hmo_claims_patient ON hmo_claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_hmo_claims_invoice ON hmo_claims(invoice_id);
CREATE INDEX IF NOT EXISTS idx_hmo_claims_status ON hmo_claims(status);
CREATE INDEX IF NOT EXISTS idx_hmo_claims_provider ON hmo_claims(provider_id);
CREATE INDEX IF NOT EXISTS idx_hmo_claims_pending ON hmo_claims(tenant_id, status) WHERE status IN ('draft','pending','submitted');
CREATE INDEX IF NOT EXISTS idx_hmo_claims_branch ON hmo_claims(branch_id);

-- ============================================================
-- 6. hmo_encounters  (visit-level encounter tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS hmo_encounters (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id         uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id       uuid REFERENCES insurance_providers(id) ON DELETE SET NULL,
  policy_id         uuid REFERENCES insurance_policies(id) ON DELETE SET NULL,
  appointment_id    uuid REFERENCES appointments(id) ON DELETE SET NULL,
  encounter_type    text NOT NULL CHECK (encounter_type IN ('outpatient','inpatient','emergency','pharmacy','lab','maternity','other')),
  encounter_date    date NOT NULL DEFAULT CURRENT_DATE,
  doctor_id         uuid REFERENCES users(id),
  diagnosis_code    text,
  diagnosis_desc    text,
  total_billed      numeric(12,2) NOT NULL DEFAULT 0,
  total_covered     numeric(12,2) NOT NULL DEFAULT 0,
  total_co_pay      numeric(12,2) NOT NULL DEFAULT 0,
  claim_id          uuid REFERENCES hmo_claims(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','claimed')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hmo_encounters_tenant ON hmo_encounters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hmo_encounters_patient ON hmo_encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_hmo_encounters_date ON hmo_encounters(encounter_date);

-- ============================================================
-- 7. Claim number generator RPC
-- ============================================================
CREATE OR REPLACE FUNCTION next_hmo_claim_number(p_tenant uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num integer;
  claim_num text;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(claim_number, '^CLM-', ''), '')::integer), 0) + 1
  INTO next_num
  FROM hmo_claims
  WHERE tenant_id = p_tenant;

  claim_num := 'CLM-' || LPAD(next_num::text, 6, '0');
  RETURN claim_num;
END;
$$;

REVOKE ALL ON FUNCTION next_hmo_claim_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION next_hmo_claim_number(uuid) TO service_role;

-- ============================================================
-- 8. Coverage lookup RPC — returns effective coverage for a service
-- ============================================================
CREATE OR REPLACE FUNCTION get_effective_coverage(
  p_tenant uuid,
  p_provider uuid,
  p_service_type text,
  p_service_id uuid DEFAULT NULL
)
RETURNS TABLE (
  rule_id uuid,
  coverage_percent numeric,
  co_pay_amount numeric,
  covered_amount numeric,
  requires_authorization boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.coverage_percent,
    r.co_pay_amount,
    r.covered_amount,
    r.requires_authorization
  FROM insurance_coverage_rules r
  WHERE r.tenant_id = p_tenant
    AND r.provider_id = p_provider
    AND r.service_type = p_service_type
    AND r.is_active = true
    AND (
      (p_service_id IS NULL AND r.service_id IS NULL)
      OR r.service_id = p_service_id
    )
  ORDER BY r.service_id NULLS LAST
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION get_effective_coverage(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_effective_coverage(uuid, uuid, text, uuid) TO service_role;

-- ============================================================
-- 9. Insurance summary RPC — per-patient insurance summary
-- ============================================================
CREATE OR REPLACE FUNCTION get_patient_insurance_summary(p_tenant uuid, p_patient uuid)
RETURNS TABLE (
  policy_id uuid,
  provider_name text,
  policy_number text,
  plan_name text,
  coverage_type text,
  co_pay_percent numeric,
  status text,
  expiry_date date,
  is_primary boolean,
  dependants_covered integer,
  dependant_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pol.id,
    pr.name,
    pol.policy_number,
    pol.plan_name,
    pol.coverage_type,
    pol.co_pay_percent,
    pol.status,
    pol.expiry_date,
    pol.is_primary,
    pol.dependants_covered,
    (SELECT count(*) FROM patients p
     WHERE p.primary_account_id = p_patient
       AND p.tenant_id = p_tenant) as dependant_count
  FROM insurance_policies pol
  JOIN insurance_providers pr ON pr.id = pol.provider_id
  WHERE pol.tenant_id = p_tenant
    AND pol.patient_id = p_patient
    AND pol.status = 'active'
  ORDER BY pol.is_primary DESC, pol.created_at;
END;
$$;

REVOKE ALL ON FUNCTION get_patient_insurance_summary(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_patient_insurance_summary(uuid, uuid) TO service_role;

-- ============================================================
-- 10. updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_hmo_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_insurance_providers_updated') THEN
    CREATE TRIGGER trg_insurance_providers_updated BEFORE UPDATE ON insurance_providers FOR EACH ROW EXECUTE FUNCTION update_hmo_timestamp();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_insurance_policies_updated') THEN
    CREATE TRIGGER trg_insurance_policies_updated BEFORE UPDATE ON insurance_policies FOR EACH ROW EXECUTE FUNCTION update_hmo_timestamp();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_insurance_coverage_rules_updated') THEN
    CREATE TRIGGER trg_insurance_coverage_rules_updated BEFORE UPDATE ON insurance_coverage_rules FOR EACH ROW EXECUTE FUNCTION update_hmo_timestamp();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_insurance_authorizations_updated') THEN
    CREATE TRIGGER trg_insurance_authorizations_updated BEFORE UPDATE ON insurance_authorizations FOR EACH ROW EXECUTE FUNCTION update_hmo_timestamp();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hmo_claims_updated') THEN
    CREATE TRIGGER trg_hmo_claims_updated BEFORE UPDATE ON hmo_claims FOR EACH ROW EXECUTE FUNCTION update_hmo_timestamp();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hmo_encounters_updated') THEN
    CREATE TRIGGER trg_hmo_encounters_updated BEFORE UPDATE ON hmo_encounters FOR EACH ROW EXECUTE FUNCTION update_hmo_timestamp();
  END IF;
END $$;

-- ============================================================
-- 11. RLS policies — staff read, admin write
-- ============================================================
ALTER TABLE insurance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_coverage_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hmo_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE hmo_encounters ENABLE ROW LEVEL SECURITY;

-- Insurance providers
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_providers_staff_read' AND tablename = 'insurance_providers') THEN
    CREATE POLICY insurance_providers_staff_read ON insurance_providers
      FOR SELECT USING (is_staff() AND (tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_providers_admin_write' AND tablename = 'insurance_providers') THEN
    CREATE POLICY insurance_providers_admin_write ON insurance_providers
      FOR ALL USING (is_hospital_admin() AND tenant_id = get_tenant_id());
  END IF;
END $$;

-- Insurance policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_policies_staff_read' AND tablename = 'insurance_policies') THEN
    CREATE POLICY insurance_policies_staff_read ON insurance_policies
      FOR SELECT USING (is_staff() AND (tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'insurance_policies_admin_write' AND tablename = 'insurance_policies') THEN
    CREATE POLICY insurance_policies_admin_write ON insurance_policies
      FOR ALL USING ((is_hospital_admin() OR is_hmo_officer()) AND tenant_id = get_tenant_id());
  END IF;
END $$;

-- Coverage rules
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'coverage_rules_staff_read' AND tablename = 'insurance_coverage_rules') THEN
    CREATE POLICY coverage_rules_staff_read ON insurance_coverage_rules
      FOR SELECT USING (is_staff() AND (tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'coverage_rules_admin_write' AND tablename = 'insurance_coverage_rules') THEN
    CREATE POLICY coverage_rules_admin_write ON insurance_coverage_rules
      FOR ALL USING (is_hospital_admin() AND tenant_id = get_tenant_id());
  END IF;
END $$;

-- Authorizations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_staff_read' AND tablename = 'insurance_authorizations') THEN
    CREATE POLICY auth_staff_read ON insurance_authorizations
      FOR SELECT USING (is_staff() AND (tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_admin_write' AND tablename = 'insurance_authorizations') THEN
    CREATE POLICY auth_admin_write ON insurance_authorizations
      FOR ALL USING ((is_hospital_admin() OR is_hmo_officer()) AND tenant_id = get_tenant_id());
  END IF;
END $$;

-- HMO claims
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hmo_claims_staff_read' AND tablename = 'hmo_claims') THEN
    CREATE POLICY hmo_claims_staff_read ON hmo_claims
      FOR SELECT USING (is_staff() AND (tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hmo_claims_admin_write' AND tablename = 'hmo_claims') THEN
    CREATE POLICY hmo_claims_admin_write ON hmo_claims
      FOR ALL USING ((is_hospital_admin() OR is_hmo_officer()) AND tenant_id = get_tenant_id());
  END IF;
END $$;

-- HMO encounters
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hmo_encounters_staff_read' AND tablename = 'hmo_encounters') THEN
    CREATE POLICY hmo_encounters_staff_read ON hmo_encounters
      FOR SELECT USING (is_staff() AND (tenant_id = get_tenant_id() OR is_super_admin()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hmo_encounters_admin_write' AND tablename = 'hmo_encounters') THEN
    CREATE POLICY hmo_encounters_admin_write ON hmo_encounters
      FOR ALL USING ((is_hospital_admin() OR is_hmo_officer()) AND tenant_id = get_tenant_id());
  END IF;
END $$;

-- ============================================================
-- 12. Extend patients: auto-copy insurance from primary account
-- ============================================================
-- Dependants inherit primary holder's insurance when policies are created.
-- This is handled at the API layer (when adding a dependant, copy the primary's active policies).
-- No DB-level trigger needed — the API ensures consistency.

-- ============================================================
-- Done.
-- ============================================================
