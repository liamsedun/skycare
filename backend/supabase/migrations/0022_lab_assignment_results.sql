-- ============================================================================
-- SKYCARE — MIGRATION 0022: LAB REQUESTS — STAFF ASSIGNMENT + RESULTS
--
-- 1. lab_request_assignees — junction table so an in-house lab request can be
--    routed directly to specific lab staff member(s) (multi-select). Inserted
--    by the create_lab_request RPC in the same transaction as the request, so
--    the DEFERRED messaging trigger (0020) sees the assignment at COMMIT and
--    notifies exactly the assigned lab staff instead of the whole lab.
-- 2. lab_request_items gains result fields (result, unit, abnormal flag,
--    reported_at) filled in by the assigned lab staff when they complete the
--    testing.
-- 3. lab_orders.lab_request_id links the PATIENT-PORTAL lab_orders system to
--    this request so reported results also appear on the patient's "Lab
--    results" page (the two systems were previously disconnected).
-- 4. create_lab_request gains p_assigned_user_ids uuid[] — validated against
--    active lab staff of the same tenant, then stored in assignments.
-- 5. notify_lab_request now notifies the ASSIGNED lab staff (when present),
--    falling back to all lab staff only when nothing is assigned.
-- Idempotent.
-- ============================================================================

-- ============================================================================
-- 1. ASSIGNEES — who carries out the testing
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_request_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lab_request_assignment UNIQUE (request_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_lab_request_assignments_request ON lab_request_assignments (request_id);
CREATE INDEX IF NOT EXISTS idx_lab_request_assignments_user   ON lab_request_assignments (user_id);

-- RLS: staff of the request's tenant + super_admin can read; writes are done
-- by the API layer (service role), so no INSERT/UPDATE/DELETE policies.
ALTER TABLE lab_request_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_request_assignments_staff_read ON lab_request_assignments;
CREATE POLICY lab_request_assignments_staff_read ON lab_request_assignments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lab_requests lr
    WHERE lr.id = lab_request_assignments.request_id
      AND lr.tenant_id = get_tenant_id()
      AND is_staff()) OR is_super_admin());

-- ============================================================================
-- 2. RESULT COLUMNS on lab_request_items
-- ============================================================================
ALTER TABLE lab_request_items
  ADD COLUMN IF NOT EXISTS result          text,
  ADD COLUMN IF NOT EXISTS result_unit     text,
  ADD COLUMN IF NOT EXISTS is_abnormal     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reported_at     timestamptz;

-- ============================================================================
-- 3. Link to the patient-portal lab_orders system (legacy, read by
--    /patient/lab-results). Reported lab requests will mirror here so the
--    patient's portal shows the results.
-- ============================================================================
ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS lab_request_id uuid REFERENCES lab_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lab_orders_lab_request ON lab_orders (lab_request_id) WHERE lab_request_id IS NOT NULL;

-- ============================================================================
-- 4. create_lab_request — accept p_assigned_user_ids
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_lab_request(
  p_patient_id         uuid,
  p_services           jsonb,
  p_is_external        boolean DEFAULT false,
  p_external_lab_id    text DEFAULT NULL,
  p_doctor_id          uuid DEFAULT NULL,
  p_branch_id          uuid DEFAULT NULL,
  p_notes              text DEFAULT NULL,
  p_created_by         uuid DEFAULT NULL,
  p_assigned_user_ids  uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient  patients%ROWTYPE;
  v_tenant   uuid;
  v_doctor   users%ROWTYPE;
  v_assigned users%ROWTYPE;
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

  -- Assigned lab staff must be active lab staff members of the same tenant.
  -- Only meaningful for in-house requests.
  IF p_assigned_user_ids IS NOT NULL AND NOT p_is_external THEN
    FOR v_item IN
      SELECT unnest(p_assigned_user_ids) AS uid
    LOOP
      SELECT * INTO v_assigned
        FROM users
       WHERE id = v_item.uid AND tenant_id = v_tenant AND is_active;
      IF NOT FOUND OR v_assigned.role NOT IN
        ('lab_tech','radiologist','radiographer','hospital_admin') THEN
        RAISE EXCEPTION 'Invalid lab staff assigned';
      END IF;
    END LOOP;
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

  -- Assign lab staff (same transaction — visible to the deferred trigger).
  IF p_assigned_user_ids IS NOT NULL AND NOT p_is_external THEN
    INSERT INTO lab_request_assignments (request_id, user_id)
    SELECT v_request.id, iid
      FROM unnest(p_assigned_user_ids) AS iid
     ON CONFLICT (request_id, user_id) DO NOTHING;
  END IF;

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

REVOKE ALL ON FUNCTION public.create_lab_request(uuid, jsonb, boolean, text, uuid, uuid, text, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_lab_request(uuid, jsonb, boolean, text, uuid, uuid, text, uuid, uuid[])
  TO service_role;

-- ============================================================================
-- 5. notify_lab_request — notify the ASSIGNED lab staff first (multi-select
--    assignment), fall back to all lab staff only when nothing was assigned.
--    Patient + main patient (for dependants) are always in copy, exactly as
--    before.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_lab_request(p_request_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req      RECORD;
  v_patient  RECORD;
  v_main     RECORD;
  v_services text;
  v_urgent   boolean;
  v_recip    uuid;
  v_notified uuid[] := '{}';
BEGIN
  -- Resolve the request
  SELECT id, tenant_id, branch_id, patient_id, is_external
    INTO v_req
    FROM lab_requests
   WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lab request % not found', p_request_id;
  END IF;

  -- Resolve the patient (and whether this is a dependant request)
  SELECT id, first_name, last_name, user_id, primary_account_id
    INTO v_patient
    FROM patients
   WHERE id = v_req.patient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient % not found', v_req.patient_id;
  END IF;

  -- Service list for the message body (spec: "list of services in message")
  SELECT string_agg(i.service_name, ', ' ORDER BY i.created_at),
         bool_or(i.priority IN ('urgent', 'stat'))
    INTO v_services, v_urgent
    FROM lab_request_items i
   WHERE i.request_id = p_request_id;
  v_services := COALESCE(v_services, 'N/A');

  -- -------------------------------------------------------------------------
  -- FLOW A: in-house -> message the ASSIGNED lab staff (or all lab staff when
  -- no explicit assignment exists), then the patient.
  -- -------------------------------------------------------------------------
  IF NOT v_req.is_external THEN
    IF EXISTS (SELECT 1 FROM lab_request_assignments WHERE request_id = p_request_id) THEN
      FOR v_recip IN
        SELECT a.user_id
          FROM lab_request_assignments a
          JOIN users u ON u.id = a.user_id
         WHERE a.request_id = p_request_id
           AND u.tenant_id = v_req.tenant_id
           AND u.is_active
           AND (u.branch_id IS NULL
                OR v_req.branch_id IS NULL
                OR u.branch_id = v_req.branch_id)
      LOOP
        IF NOT v_recip = ANY (v_notified) THEN
          INSERT INTO notifications
            (tenant_id, user_id, channel, event, title, message,
             reference_type, reference_id, is_read, status, sent_at)
          VALUES
            (v_req.tenant_id, v_recip, 'in_app', 'lab_result',
             'New lab request assigned to you',
             format('Lab request for %s %s — %s%s (assigned to you)',
                    v_patient.first_name, v_patient.last_name,
                    v_services,
                    CASE WHEN v_urgent THEN ' (URGENT)' ELSE '' END),
             'lab_requests', p_request_id, false, 'sent', now());
          v_notified := v_notified || v_recip;
        END IF;
      END LOOP;
    ELSE
      FOR v_recip IN
        SELECT u.id
          FROM users u
         WHERE u.tenant_id = v_req.tenant_id
           AND u.is_active
           AND u.role IN ('lab_tech', 'hospital_admin')
           AND (u.branch_id IS NULL
                OR v_req.branch_id IS NULL
                OR u.branch_id = v_req.branch_id)
      LOOP
        IF NOT v_recip = ANY (v_notified) THEN
          INSERT INTO notifications
            (tenant_id, user_id, channel, event, title, message,
             reference_type, reference_id, is_read, status, sent_at)
          VALUES
            (v_req.tenant_id, v_recip, 'in_app', 'lab_result',
             'New lab request',
             format('Lab request for %s %s — %s%s',
                    v_patient.first_name, v_patient.last_name,
                    v_services,
                    CASE WHEN v_urgent THEN ' (URGENT)' ELSE '' END),
             'lab_requests', p_request_id, false, 'sent', now());
          v_notified := v_notified || v_recip;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- Both flows: message the patient (portal account)
  -- -------------------------------------------------------------------------
  IF v_patient.user_id IS NOT NULL
     AND NOT v_patient.user_id = ANY (v_notified) THEN
    INSERT INTO notifications
      (tenant_id, user_id, channel, event, title, message,
       reference_type, reference_id, is_read, status, sent_at)
    VALUES
      (v_req.tenant_id, v_patient.user_id, 'in_app', 'lab_result',
       'Lab tests ordered',
       format('Lab tests ordered for you — %s%s',
              v_services,
              CASE WHEN v_urgent THEN ' (URGENT)' ELSE '' END),
       'lab_requests', p_request_id, false, 'sent', now());
    v_notified := v_notified || v_patient.user_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- Both flows: dependant request -> also copy the main patient
  -- -------------------------------------------------------------------------
  IF v_patient.primary_account_id IS NOT NULL THEN
    SELECT id, first_name, last_name, user_id
      INTO v_main
      FROM patients
     WHERE id = v_patient.primary_account_id;
    IF v_main.user_id IS NOT NULL
       AND NOT v_main.user_id = ANY (v_notified) THEN
      INSERT INTO notifications
        (tenant_id, user_id, channel, event, title, message,
         reference_type, reference_id, is_read, status, sent_at)
      VALUES
        (v_req.tenant_id, v_main.user_id, 'in_app', 'lab_result',
         'Lab tests ordered',
         format('Lab tests ordered for %s %s (family member) — %s',
                v_patient.first_name, v_patient.last_name,
                v_services),
         'lab_requests', p_request_id, false, 'sent', now());
      v_notified := v_notified || v_main.user_id;
    END IF;
  END IF;

  RETURN v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_lab_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_lab_request(uuid) TO service_role;