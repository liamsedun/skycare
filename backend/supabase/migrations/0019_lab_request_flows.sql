-- 0019: Lab request notification flows (in-house + external).
--
-- One SECURITY DEFINER RPC drives both flows; the API layer inserts the
-- request + items (validated, audited) and then calls this to fan out
-- notifications. Returns the notified user_ids so the API layer can also
-- fire web push (push needs env VAPID keys — not possible from SQL).
--
-- FLOW A — IN-HOUSE (is_external = false):
--   Doctor creates lab request  ->  system assigns it to the hospital lab
--   (assignment = tenant + branch scoping on lab_requests; lab staff see all
--   requests for their tenant/branch on the lab page)  and messages:
--     1. lab staff (lab_tech + hospital_admin, active, tenant/branch match)
--     2. the patient (portal account)
--     3. the main patient too, when the request is for a dependant
-- FLOW B — EXTERNAL (is_external = true):
--   Doctor selects an external lab  ->  NO lab-staff message; only:
--     1. the patient
--     2. the main patient (if dependant)
--   Both flows include the requested service list in the message.

CREATE OR REPLACE FUNCTION public.notify_lab_request(p_request_id uuid)
RETURNS uuid[]          -- user_ids that received an in-app notification
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
  -- FLOW A: in-house -> message lab staff (lab_tech + hospital_admin)
  -- -------------------------------------------------------------------------
  IF NOT v_req.is_external THEN
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

-- Only the API layer (service role) may trigger the fan-out; no anon /
-- authenticated direct calls.
REVOKE ALL ON FUNCTION public.notify_lab_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_lab_request(uuid) TO service_role;
