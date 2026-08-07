-- ============================================================================
-- SKYCARE — MIGRATION 0020: LAB MODULE — RLS, MESSAGING TRIGGER, CREATE RPC
--
-- 1. RLS policies for lab_requests / lab_request_items:
--      * doctors (clinicians + hospital_admin) can CREATE requests
--      * lab staff (lab_tech) can VIEW IN-HOUSE requests only
--      * other staff view everything in their tenant; patients view their own
--      * external labs have NO auth identity (external_lab_id is opaque text),
--        so anon access is revoked on all lab tables — they cannot reach the
--        database through any path
-- 2. AFTER INSERT trigger on lab_requests -> lab messaging:
--      * in-house  -> notify lab staff + patient (+ main patient if dependant)
--      * external  -> notify patient only (+ main patient if dependant)
--    Implemented as a DEFERRED constraint trigger so it fires at COMMIT, when
--    lab_request_items (inserted right after the request) are already present
--    and the service list in the message is complete.
-- 3. create_lab_request(patient_id, services[], is_external, external_lab_id)
--    RPC — single transaction: inserts request + items; messaging follows via
--    the deferred trigger. SECURITY DEFINER; service_role-only.
-- Idempotent.
-- ============================================================================

-- ============================================================================
-- 1. RLS — lab_requests
-- ============================================================================

-- Replace the old blanket "all staff, all operations" policy (0018) with the
-- operation- and role-scoped set below.
DROP POLICY IF EXISTS lab_requests_staff ON lab_requests;

-- (a) CREATE — clinicians (doctors) + hospital_admin + super_admin
CREATE POLICY lab_requests_clinician_insert ON lab_requests FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id()
              AND (get_role() IN ('doctor','medical_officer','surgeon','anesthesiologist',
                                  'radiologist','radiographer','physiotherapist','dentist',
                                  'optometrist','dietician','paramedic','hospital_admin')
                   OR is_super_admin()));

-- (b) READ — lab staff see IN-HOUSE requests only (external orders never hit
--     the hospital lab; the referring doctor + admin still see them via (c))
CREATE POLICY lab_requests_lab_read ON lab_requests FOR SELECT
  USING (tenant_id = get_tenant_id()
         AND get_role() = 'lab_tech'
         AND NOT is_external);

-- (c) READ — every other staff role (incl. referring doctors) sees all
--     tenant requests; super_admin sees all (tenant_id IS NULL platform-wide)
CREATE POLICY lab_requests_staff_read ON lab_requests FOR SELECT
  USING ((tenant_id = get_tenant_id() AND is_staff() AND get_role() <> 'lab_tech')
         OR is_super_admin());

-- (d) UPDATE — status flow (sample_collected / in_progress / completed /
--     cancelled) is driven by lab staff + admins; patients cannot touch it
CREATE POLICY lab_requests_staff_update ON lab_requests FOR UPDATE
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));

-- (e) DELETE — hospital_admin / super_admin only
CREATE POLICY lab_requests_admin_delete ON lab_requests FOR DELETE
  USING (tenant_id = get_tenant_id() AND (get_role() = 'hospital_admin' OR is_super_admin()));

-- ============================================================================
-- 1b. RLS — lab_request_items (visibility mirrors its request)
-- ============================================================================

DROP POLICY IF EXISTS lab_request_items_staff ON lab_request_items;

-- READ — lab staff: items of IN-HOUSE requests only
CREATE POLICY lab_request_items_lab_read ON lab_request_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id()
      AND get_role() = 'lab_tech'
      AND NOT lr.is_external));

-- READ — other staff (doctors etc.) + super_admin
CREATE POLICY lab_request_items_staff_read ON lab_request_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id()
      AND ((is_staff() AND get_role() <> 'lab_tech') OR is_super_admin())));

-- INSERT — clinicians + hospital_admin + super_admin
CREATE POLICY lab_request_items_clinician_insert ON lab_request_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id()
      AND (get_role() IN ('doctor','medical_officer','surgeon','anesthesiologist',
                          'radiologist','radiographer','physiotherapist','dentist',
                          'optometrist','dietician','paramedic','hospital_admin')
           OR is_super_admin())));

-- UPDATE — lab staff + admins (status flow)
CREATE POLICY lab_request_items_staff_update ON lab_request_items FOR UPDATE
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

-- DELETE — hospital_admin / super_admin only
CREATE POLICY lab_request_items_admin_delete ON lab_request_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_items.request_id
      AND lr.tenant_id = get_tenant_id()
      AND (get_role() = 'hospital_admin' OR is_super_admin())));

-- ============================================================================
-- 1c. External labs cannot access system data.
-- External labs are NOT auth principals (no role in app_role, no login, no
-- API surface) — external_lab_id is just an opaque text column on the
-- request. As defence in depth, revoke every lab-table privilege from the
-- anon role so a raw PostgREST request with no session is impossible.
-- (authenticated + service_role grants stay; RLS gates rows per role.)
-- ============================================================================

REVOKE ALL ON lab_categories, lab_services, lab_requests, lab_request_items FROM anon;

-- ============================================================================
-- 2. MESSAGING TRIGGER — fires when a lab_request is created.
--    Deferred: runs at COMMIT so lab_request_items exist (service list in the
--    message). Delegates to notify_lab_request (migration 0019):
--      in-house -> lab staff (lab_tech + hospital_admin) + patient
--                  (+ main patient when the request is for a dependant)
--      external -> patient (+ main patient if dependant) ONLY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lab_request_created_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_lab_request(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_request_created_notify ON lab_requests;
CREATE CONSTRAINT TRIGGER trg_lab_request_created_notify
  AFTER INSERT ON lab_requests
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.lab_request_created_notify();

-- ============================================================================
-- 3. RPC — create_lab_request(patient_id, services[], is_external,
--    external_lab_id)
--    Single transaction: validates patient/doctor/services against the
--    patient's own tenant (never trusts a caller-supplied tenant id), inserts
--    the request + items, and lets the deferred trigger above fan out the
--    messaging at COMMIT. Returns the created request (snake_case, with
--    lab_request_items).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_lab_request(
  p_patient_id      uuid,
  p_services        jsonb,
  p_is_external     boolean DEFAULT false,
  p_external_lab_id text DEFAULT NULL,
  p_doctor_id       uuid DEFAULT NULL,
  p_branch_id       uuid DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_created_by      uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient  patients%ROWTYPE;
  v_tenant   uuid;
  v_doctor   users%ROWTYPE;
  v_request  lab_requests%ROWTYPE;
  v_item     RECORD;
  v_svc      lab_services%ROWTYPE;
  v_name     text;
  v_priority text;
  v_missing  int := 0;
  v_items    jsonb := '[]'::jsonb;
  v_result   jsonb;
BEGIN
  -- Anchor: tenant comes from the patient row, never from the caller.
  SELECT * INTO v_patient FROM patients WHERE id = p_patient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;
  v_tenant := v_patient.tenant_id;

  -- Doctor must be an active clinician of the same tenant.
  IF p_doctor_id IS NOT NULL THEN
    SELECT * INTO v_doctor
      FROM users
     WHERE id = p_doctor_id AND tenant_id = v_tenant AND is_active;
    IF NOT FOUND OR v_doctor.role NOT IN
      ('doctor','medical_officer','surgeon','anesthesiologist','radiologist',
       'radiographer','physiotherapist','dentist','optometrist','dietician',
       'paramedic','hospital_admin') THEN
      RAISE EXCEPTION 'Invalid doctor selected';
    END IF;
  END IF;

  -- Services: at least one, each either a catalog service id (must exist,
  -- approved, active — name snapshotted) or an anonymous service name.
  IF jsonb_typeof(p_services) IS DISTINCT FROM 'array' OR jsonb_array_length(p_services) = 0 THEN
    RAISE EXCEPTION 'At least one service is required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_services) LOOP
    IF v_item.value->>'serviceId' IS NOT NULL THEN
      SELECT * INTO v_svc
        FROM lab_services
       WHERE id = (v_item.value->>'serviceId')::uuid
         AND tenant_id = v_tenant;
      IF NOT FOUND THEN
        v_missing := v_missing + 1;
        CONTINUE;
      END IF;
      IF v_svc.approval_status <> 'approved' OR NOT v_svc.is_active THEN
        RAISE EXCEPTION 'Service "%" is not available for ordering', v_svc.name;
      END IF;
      v_name := v_svc.name;
    ELSE
      v_name := nullif(btrim(coalesce(v_item.value->>'serviceName', '')), '');
      IF v_name IS NULL THEN
        v_missing := v_missing + 1;
        CONTINUE;
      END IF;
    END IF;

    v_priority := coalesce(v_item.value->>'priority', 'routine');
    IF v_priority NOT IN ('routine','urgent','stat') THEN v_priority := 'routine'; END IF;

    v_items := v_items || jsonb_build_object(
      'service_id',   v_item.value->>'serviceId',
      'service_name', v_name,
      'priority',     v_priority,
      'sample_type',  nullif(btrim(coalesce(v_item.value->>'sampleType', '')), ''),
      'notes',        nullif(btrim(coalesce(v_item.value->>'notes', '')), '')
    );
  END LOOP;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'One or more selected services no longer exist';
  END IF;

  -- Insert the request; the deferred trigger messages at COMMIT.
  INSERT INTO lab_requests (tenant_id, branch_id, patient_id, doctor_id, status,
                            is_external, external_lab_id, notes, created_by)
  VALUES (v_tenant, p_branch_id, p_patient_id, p_doctor_id, 'requested',
          p_is_external,
          CASE WHEN p_is_external THEN nullif(btrim(p_external_lab_id), '') ELSE NULL END,
          nullif(btrim(p_notes), ''), p_created_by)
  RETURNING * INTO v_request;

  -- Insert the items (same transaction — visible to the deferred trigger).
  INSERT INTO lab_request_items (request_id, service_id, service_name, priority, sample_type, notes)
  SELECT v_request.id,
         (t->>'service_id')::uuid,
         t->>'service_name',
         t->>'priority',
         t->>'sample_type',
         t->>'notes'
    FROM jsonb_array_elements(v_items) t;

  SELECT jsonb_build_object(
    'id',               v_request.id,
    'tenant_id',        v_request.tenant_id,
    'branch_id',        v_request.branch_id,
    'patient_id',       v_request.patient_id,
    'doctor_id',        v_request.doctor_id,
    'status',           v_request.status,
    'is_external',      v_request.is_external,
    'external_lab_id',  v_request.external_lab_id,
    'requested_at',     v_request.requested_at,
    'completed_at',     v_request.completed_at,
    'notes',            v_request.notes,
    'created_by',       v_request.created_by,
    'created_at',       v_request.created_at,
    'updated_at',       v_request.updated_at,
    'lab_request_items', v_items
  ) INTO v_result;

  RETURN v_result;
END $$;

-- Service client (API layer) is the only caller; no anon / authenticated /
-- external access to the create path either.
REVOKE ALL ON FUNCTION public.create_lab_request(uuid, jsonb, boolean, text, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_lab_request(uuid, jsonb, boolean, text, uuid, uuid, text, uuid)
  TO service_role;
