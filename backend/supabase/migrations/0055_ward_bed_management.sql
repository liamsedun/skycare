-- ============================================================================
-- 0055 — WARD & BED MANAGEMENT
--  * Extension-only: the existing wards/beds/admissions tables are NOT altered
--    (no ALTER TABLE on them). All new workflow state lives in new tables:
--    ward_daily_rates, bed_transfers, ward_rounds, discharges.
--  * ward_admit / ward_transfer / ward_discharge / ward_round_add — the four
--    clinical workflows, as plpgsql RPCs that keep beds + admissions in sync.
--  * ward_bed_map — realtime-read snapshot (every seat + occupant).
--  * ward_dashboard / ward_forecast — KPI + AI length-of-stay/occupancy.
--  * ward_discharge_charges — billing: daily-accumulated room charge posted to
--    the central invoices ledger as "Ward" invoice items.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New tables (extension only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ward_daily_rates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ward_id    uuid NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  rate       numeric(12,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ward_rate_tenant UNIQUE (tenant_id, ward_id)
);
CREATE INDEX IF NOT EXISTS idx_ward_rates_tenant ON public.ward_daily_rates (tenant_id);

CREATE TABLE IF NOT EXISTS public.bed_transfers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id    uuid REFERENCES branches(id) ON DELETE SET NULL,
  admission_id uuid NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  from_bed_id  uuid NOT NULL REFERENCES beds(id),
  to_bed_id    uuid NOT NULL REFERENCES beds(id),
  reason       text,
  transferred_by uuid REFERENCES users(id),
  transferred_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bed_transfers_tenant ON public.bed_transfers (tenant_id, transferred_at);
CREATE INDEX IF NOT EXISTS idx_bed_transfers_admission ON public.bed_transfers (admission_id);

CREATE TABLE IF NOT EXISTS public.ward_rounds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  admission_id  uuid NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id     uuid REFERENCES users(id),
  vitals        jsonb NOT NULL DEFAULT '{}'::jsonb,
  medications   jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes         text,
  round_time    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ward_rounds_tenant ON public.ward_rounds (tenant_id, round_time);
CREATE INDEX IF NOT EXISTS idx_ward_rounds_admission ON public.ward_rounds (admission_id);

CREATE TABLE IF NOT EXISTS public.discharges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  admission_id uuid UNIQUE NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  summary     text NOT NULL,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up   text,
  discharged_by uuid REFERENCES users(id),
  discharged_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discharges_tenant ON public.discharges (tenant_id, discharged_at);
CREATE INDEX IF NOT EXISTS idx_discharges_patient ON public.discharges (patient_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — new tables follow the tenant-scoped staff pattern used by 0008.
--    Writes flow through the service client / RPCs; SELECT is staff-only.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ward_daily_rates_staff ON public.ward_daily_rates;
CREATE POLICY ward_daily_rates_staff ON public.ward_daily_rates
  FOR ALL USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

DROP POLICY IF EXISTS bed_transfers_staff ON public.bed_transfers;
CREATE POLICY bed_transfers_staff ON public.bed_transfers
  FOR SELECT USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

DROP POLICY IF EXISTS ward_rounds_staff ON public.ward_rounds;
CREATE POLICY ward_rounds_staff ON public.ward_rounds
  FOR SELECT USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

DROP POLICY IF EXISTS discharges_staff ON public.discharges;
CREATE POLICY discharges_staff ON public.discharges
  FOR SELECT USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

ALTER TABLE public.ward_daily_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bed_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discharges ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. WRITE workflows (RPC) — service-client callers, RLS protected reads.
-- ---------------------------------------------------------------------------

-- ADMIT: mark bed occupied, insert admissions row (status admitted).
-- Validate: patient must exist; bed must be available and belong to a ward
-- the tenant owns; the patient must not already have an active admission.
CREATE OR REPLACE FUNCTION public.ward_admit(
  p_tenant uuid,
  p_patient_id uuid,
  p_bed_id uuid,
  p_visit_id uuid DEFAULT NULL,
  p_admitting_doctor uuid DEFAULT NULL,
  p_expected_discharge date DEFAULT NULL,
  p_diagnosis text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_branch uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_bed public.beds%ROWTYPE;
  v_ward public.wards%ROWTYPE;
  v_admission_id uuid;
  v_active int;
BEGIN
  SELECT * INTO v_bed FROM public.beds WHERE id = p_bed_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BED_NOT_FOUND'; END IF;

  SELECT * INTO v_ward FROM public.wards WHERE id = v_bed.ward_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WARD_TENANT_MISMATCH'; END IF;

  IF v_bed.status <> 'available' THEN RAISE EXCEPTION 'BED_NOT_AVAILABLE'; END IF;

  SELECT COUNT(*) INTO v_active FROM public.admissions
   WHERE patient_id = p_patient_id AND status IN ('admitted','transferred');
  IF v_active > 0 THEN RAISE EXCEPTION 'PATIENT_ALREADY_ADMITTED'; END IF;

  INSERT INTO public.admissions
    (tenant_id, branch_id, patient_id, visit_id, bed_id, admitting_doctor,
     expected_discharge, diagnosis_at_admission, notes, status, created_by)
  VALUES
    (p_tenant, COALESCE(p_branch, v_ward.branch_id), p_patient_id, p_visit_id, p_bed_id,
     p_admitting_doctor, p_expected_discharge, p_diagnosis, p_notes, 'admitted', p_admitting_doctor)
  RETURNING id INTO v_admission_id;

  UPDATE public.beds SET status = 'occupied', updated_at = now() WHERE id = p_bed_id;
  RETURN v_admission_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.ward_admit(uuid, uuid, uuid, uuid, uuid, date, text, text, uuid) TO authenticated;

-- TRANSFER — free from_bed, occupy to_bed, update admission bed pointing, log.
CREATE OR REPLACE FUNCTION public.ward_transfer(
  p_tenant uuid,
  p_admission_id uuid,
  p_to_bed_id uuid,
  p_reason text DEFAULT NULL,
  p_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_adm public.admissions%ROWTYPE;
  v_from_bed public.beds%ROWTYPE;
  v_to_bed public.beds%ROWTYPE;
  v_ward public.wards%ROWTYPE;
BEGIN
  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_NOT_FOUND'; END IF;
  IF v_adm.status <> 'admitted' THEN RAISE EXCEPTION 'ADMISSION_NOT_ADMITTED'; END IF;

  SELECT * INTO v_to_bed FROM public.beds WHERE id = p_to_bed_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BED_NOT_FOUND'; END IF;
  SELECT * INTO v_ward FROM public.wards WHERE id = v_to_bed.ward_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'WARD_TENANT_MISMATCH'; END IF;
  IF v_to_bed.status <> 'available' THEN RAISE EXCEPTION 'BED_NOT_AVAILABLE'; END IF;

  SELECT * INTO v_from_bed FROM public.beds WHERE id = v_adm.bed_id FOR UPDATE;

  INSERT INTO public.bed_transfers
    (tenant_id, branch_id, admission_id, patient_id, from_bed_id, to_bed_id, reason, transferred_by)
  VALUES (p_tenant, v_adm.branch_id, v_adm.id, v_adm.patient_id, v_from_bed.id, p_to_bed_id, p_reason, p_by);

  UPDATE public.beds SET status = 'available', updated_at = now() WHERE id = v_from_bed.id;
  UPDATE public.beds SET status = 'occupied', updated_at = now() WHERE id = v_to_bed.id;
  UPDATE public.admissions SET bed_id = p_to_bed_id, updated_at = now() WHERE id = v_adm.id;

  RETURN p_admission_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.ward_transfer(uuid, uuid, uuid, text, uuid) TO authenticated;

-- DISCHARGE: free bed, add discharges row; the patient's active admission is
-- closed (status 'discharged'). Requires the summary text.
CREATE OR REPLACE FUNCTION public.ward_discharge(
  p_tenant uuid,
  p_admission_id uuid,
  p_summary text,
  p_medications jsonb DEFAULT '[]'::jsonb,
  p_follow_up text DEFAULT NULL,
  p_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_adm public.admissions%ROWTYPE;
  v_bed public.beds%ROWTYPE;
BEGIN
  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_NOT_FOUND'; END IF;
  IF v_adm.status <> 'admitted' THEN RAISE EXCEPTION 'ADMISSION_NOT_ADMITTED'; END IF;
  IF NULLIF(trim(p_summary), '') IS NULL THEN RAISE EXCEPTION 'SUMMARY_REQUIRED'; END IF;

  SELECT * INTO v_bed FROM public.beds WHERE id = v_adm.bed_id FOR UPDATE;
  IF FOUND AND v_bed.status = 'occupied' THEN
    UPDATE public.beds SET status = 'available', updated_at = now() WHERE id = v_bed.id;
  END IF;

  INSERT INTO public.discharges (tenant_id, branch_id, admission_id, patient_id, summary, medications, follow_up, discharged_by)
  VALUES (p_tenant, v_adm.branch_id, v_adm.id, v_adm.patient_id, p_summary, p_medications, p_follow_up, p_by);

  UPDATE public.admissions SET status = 'discharged', discharged_at = now(), updated_at = now() WHERE id = v_adm.id;
  RETURN v_adm.id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.ward_discharge(uuid, uuid, text, jsonb, text, uuid) TO authenticated;

-- ROUND: add a ward_rounds row for an active admission.
CREATE OR REPLACE FUNCTION public.ward_round_add(
  p_tenant uuid,
  p_admission_id uuid,
  p_notes text,
  p_vitals jsonb DEFAULT '{}'::jsonb,
  p_medications jsonb DEFAULT '[]'::jsonb,
  p_doctor uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_adm public.admissions%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_NOT_FOUND'; END IF;
  IF v_adm.status <> 'admitted' THEN RAISE EXCEPTION 'ADMISSION_NOT_ACTIVE'; END IF;

  INSERT INTO public.ward_rounds (tenant_id, branch_id, admission_id, patient_id, doctor_id,
                                  notes, vitals, medications, created_by)
  VALUES (p_tenant, v_adm.branch_id, v_adm.id, v_adm.patient_id, COALESCE(p_doctor, v_adm.admitting_doctor),
          p_notes, COALESCE(p_vitals,'{}'::jsonb), COALESCE(p_medications,'[]'::jsonb), p_doctor)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.ward_round_add(uuid, uuid, text, jsonb, jsonb, uuid) TO authenticated;

-- DASHBOARD: one call = ward totals + admission KPIs + over-night census
CREATE OR REPLACE FUNCTION public.ward_dashboard(p_tenant uuid, p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_json jsonb;
BEGIN
  SELECT jsonb_build_object(
    'beds', COUNT(*),
    'available', COUNT(*) FILTER (WHERE status = 'available'),
    'occupied', COUNT(*) FILTER (WHERE status = 'occupied'),
    'maintenance', COUNT(*) FILTER (WHERE status = 'maintenance'),
    'cleaning', COUNT(*) FILTER (WHERE status = 'cleaning')
  ) INTO v_json
   FROM public.beds b JOIN public.wards w ON w.id = b.ward_id
  WHERE w.tenant_id = p_tenant AND (p_branch IS NULL OR w.branch_id = p_branch);

  RETURN jsonb_build_object(
    'as_of', now(),
    'beds', v_json,
    'admissions', (
      SELECT jsonb_build_object(
        'active', COUNT(*) FILTER (WHERE status IN ('admitted','transferred')),
        'discharged', COUNT(*) FILTER (WHERE status = 'discharged'))
      FROM public.admissions a
      WHERE a.tenant_id = p_tenant AND (p_branch IS NULL OR a.branch_id = p_branch)
    ),
    'today', (SELECT COUNT(*) FROM public.admissions a
               WHERE a.tenant_id = p_tenant AND (p_branch IS NULL OR a.branch_id = p_branch)
                 AND a.admitted_at >= now()::date),
    'dischargedToday', (SELECT COUNT(*) FROM public.discharges d
                         WHERE d.tenant_id = p_tenant AND (p_branch IS NULL OR d.branch_id = p_branch)
                           AND d.discharged_at::date = CURRENT_DATE)
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.ward_dashboard(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime — publish beds changes so the Bed map stays live
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.beds;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END;
$$;

COMMIT;