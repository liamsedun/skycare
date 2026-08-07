-- ============================================================================
-- SKYCARE — MIGRATION 0027: PRESCRIPTION EVENT FAN-OUT FIX
--
-- The 'created' fan-out fired on AFTER INSERT of prescriptions — before the
-- API writes prescription_items — so the notification message aggregated no
-- drugs (NULL) and the INSERT violated notifications.message NOT NULL.
--
-- Fix (mirrors the lab flow, which calls notify_lab_request from the API):
--   * drop the INSERT-based trigger; the status-change trigger stays
--   * harden notify_prescription_event against a NULL drug list
--   * the API layer now invokes notify_prescription_event(id,'created')
--     AFTER items are written (see POST /api/prescriptions)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_prescription_event ON prescriptions;

CREATE OR REPLACE FUNCTION notify_prescription_event(
  p_prescription_id uuid,
  p_event           text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec    record;
  v_subject text;
  v_body   text;
  v_drugs  text;
BEGIN
  SELECT p.id, p.tenant_id, p.patient_id, p.pharmacy_type, p.status,
         CONCAT_WS(' ', pat.first_name, pat.last_name) AS patient_name,
         COALESCE(pat.primary_account_id, pat.id) AS notify_patient_id,
         p.external_pharmacy_name
    INTO v_rec
    FROM prescriptions p
    JOIN patients pat ON pat.id = p.patient_id
   WHERE p.id = p_prescription_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT string_agg(
           COALESCE(pi.medication_name, d.name, 'item ' || pi.id::text)
             || ' — ' || pi.dosage || ' ' || pi.frequency
             || COALESCE(' for ' || pi.duration, '')
             || COALESCE(' (qty ' || pi.quantity || ')', ''),
           E'\n' ORDER BY pi.created_at)
    INTO v_drugs
    FROM prescription_items pi
    LEFT JOIN drugs d ON d.id = pi.drug_id
   WHERE pi.prescription_id = p_prescription_id;

  v_drugs := COALESCE(v_drugs, 'No items listed');

  v_subject := 'Prescription';
  IF p_event = 'created' THEN
    v_subject := v_subject || ' issued';
    v_body := 'Prescription issued for ' || v_rec.patient_name || ':' || E'\n' || v_drugs;
  ELSIF p_event = 'dispensed' THEN
    v_subject := v_subject || ' dispensed';
    v_body := 'Medications ready for collection at the pharmacy';
  ELSIF p_event = 'partial' THEN
    v_subject := v_subject || ' partially dispensed';
    v_body := 'Part of your prescription is ready; the remainder will follow';
  ELSIF p_event = 'cancelled' THEN
    v_subject := v_subject || ' cancelled';
    v_body := 'Your prescription was cancelled. Kindly contact the facility.';
  ELSE
    v_subject := v_subject || ' being processed';
    v_body := 'Your prescription is being processed by the pharmacy';
  END IF;

  -- in-house: notify pharmacists + hospital admins on created/processing
  IF v_rec.pharmacy_type = 'in_house' AND p_event IN ('created', 'processing') THEN
    INSERT INTO notifications (tenant_id, user_id, channel, event, title, message,
                               reference_type, reference_id, status)
    SELECT v_rec.tenant_id, u.id, 'in_app', 'prescription_' || p_event, v_subject,
           v_body, 'prescriptions', p_prescription_id, 'sent'
      FROM users u
     WHERE u.tenant_id = v_rec.tenant_id
       AND u.role IN ('pharmacist', 'hospital_admin')
       AND u.is_active
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.tenant_id = v_rec.tenant_id
           AND n.reference_type = 'prescriptions'
           AND n.reference_id = p_prescription_id
           AND n.event = 'prescription_' || p_event
           AND n.user_id = u.id
       );
  END IF;

  -- patient copy (dependant -> primary account holder)
  INSERT INTO notifications (tenant_id, patient_id, channel, event, title, message,
                             reference_type, reference_id, status)
  VALUES (v_rec.tenant_id, v_rec.notify_patient_id, 'in_app', 'prescription_' || p_event,
          v_subject,
          CASE WHEN v_rec.pharmacy_type = 'external' AND p_event = 'created'
               THEN 'Take this prescription to ' || COALESCE(v_rec.external_pharmacy_name, 'your preferred pharmacy')
                    || ':' || E'\n' || v_drugs
                    || E'\n\nFollow the instructions on the prescription.'
               ELSE v_body
          END,
          'prescriptions', p_prescription_id, 'sent');

  RETURN;
END;
$$;