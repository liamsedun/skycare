-- Migration 0102: Add pg_trigger_depth() guard to SECURITY DEFINER trigger functions
--
-- Problem: authenticated holds EXECUTE on log_audit, notify_prescription_event,
-- analytics_bump_daily, trigger_seed_lab_catalog, lab_request_created_notify.
-- Required so RLS-scoped writes fire the triggers. But any signed-in user could also
-- invoke these directly (forge notifications, fake audit entries) over REST.
--
-- Fix: pg_trigger_depth() returns 0 outside a trigger, >=1 inside one. Adding a
-- guard that raises an exception when depth = 0 blocks direct invocation while
-- leaving trigger invocations untouched. No grant changes needed.

-- 1. log_audit()
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.get_role();
  v_tenant uuid := public.get_tenant_id();
  v_action public.audit_action;
  v_changes jsonb := NULL;
  v_entity_type text := TG_TABLE_NAME;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'log_audit() may only be called from a trigger';
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME IN ('audit_logs','security_events') THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_changes := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_changes := jsonb_diff(OLD, NEW);
  ELSE
    v_action := 'delete';
    v_changes := jsonb_build_object('deleted_record', to_jsonb(OLD));
  END IF;

  INSERT INTO audit_logs (tenant_id, user_id, role, action, entity_type, entity_id, changes, ip_address, created_at)
  VALUES (v_tenant, auth.uid(), v_role, v_action, v_entity_type,
          COALESCE(NEW.id, OLD.id)::uuid, v_changes, NULL, now());
  RETURN NULL;
END $$;

-- 2. analytics_bump_daily(p_tenant_id, p_branch_id, p_date, p_field, p_delta)
CREATE OR REPLACE FUNCTION public.analytics_bump_daily(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_date date,
  p_field text,
  p_delta numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'analytics_bump_daily() may only be called from a trigger';
  END IF;
  EXECUTE format(
    'INSERT INTO analytics_daily (tenant_id, branch_id, "date", %I)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, branch_id, "date")
     DO UPDATE SET %I = analytics_daily.%I + EXCLUDED.%I, updated_at = now()',
    p_field, p_field, p_field, p_field
  ) USING p_tenant_id, p_branch_id, p_date, p_delta;
END $$;

-- 3. trigger_seed_lab_catalog()
CREATE OR REPLACE FUNCTION public.trigger_seed_lab_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'trigger_seed_lab_catalog() may only be called from a trigger';
  END IF;
  PERFORM public.seed_lab_catalog(NEW.id);
  RETURN NEW;
END $$;

-- 4. lab_request_created_notify()
CREATE OR REPLACE FUNCTION public.lab_request_created_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'lab_request_created_notify() may only be called from a trigger';
  END IF;
  PERFORM public.notify_lab_request(NEW.id);
  RETURN NEW;
END $$;

-- 5. notify_prescription_event(p_prescription_id, p_event)
CREATE OR REPLACE FUNCTION notify_prescription_event(
  p_prescription_id uuid,
  p_event           text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec     record;
  v_subject text;
  v_body    text;
  v_drugs   text;
  v_patient_user uuid;
  v_sender   uuid;
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'notify_prescription_event() may only be called from a trigger';
  END IF;

  SELECT p.id, p.tenant_id, p.patient_id, p.doctor_id, p.pharmacy_type, p.status,
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
             || ' - ' || pi.dosage || ' ' || pi.frequency
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

  -- INTERNAL MAIL FAN-OUT: same audiences, same events, via Mailbox.
  v_sender := v_rec.doctor_id;

  IF v_sender IS NOT NULL THEN
    SELECT user_id INTO v_patient_user
      FROM patients
     WHERE id = v_rec.notify_patient_id
       AND user_id IS NOT NULL;

    -- staff mail: in-house created/processing -> pharmacists + hospital admins
    IF v_rec.pharmacy_type = 'in_house' AND p_event IN ('created', 'processing') THEN
      INSERT INTO internal_messages (tenant_id, sender_id, subject, body)
      SELECT v_rec.tenant_id, v_sender, v_subject, v_body
      WHERE NOT EXISTS (
        SELECT 1 FROM internal_messages m
        WHERE m.tenant_id = v_rec.tenant_id
          AND m.sender_id = v_sender
          AND m.subject = v_subject
          AND m.created_at > now() - interval '10 minutes'
      );

      INSERT INTO internal_message_recipients (message_id, recipient_id)
      SELECT m.id, u.id
        FROM internal_messages m
        JOIN users u ON u.tenant_id = v_rec.tenant_id
                      AND u.role IN ('pharmacist', 'hospital_admin')
                      AND u.is_active
        WHERE m.tenant_id = v_rec.tenant_id
          AND m.sender_id = v_sender
          AND m.subject = v_subject
          AND m.created_at > now() - interval '10 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM internal_message_recipients r
            WHERE r.message_id = m.id AND r.recipient_id = u.id
          );
    END IF;

    -- patient mail: on ANY event type, to the portal account holder
    IF v_patient_user IS NOT NULL THEN
      INSERT INTO internal_messages (tenant_id, sender_id, subject, body)
      SELECT v_rec.tenant_id, v_sender, v_subject,
             CASE WHEN v_rec.pharmacy_type = 'external' AND p_event = 'created'
                  THEN 'Take this prescription to ' || COALESCE(v_rec.external_pharmacy_name, 'your preferred pharmacy')
                       || ':' || E'\n' || v_drugs
                       || E'\n\nFollow the instructions on the prescription.'
                  ELSE v_body
             END
      WHERE NOT EXISTS (
        SELECT 1 FROM internal_messages m
        WHERE m.tenant_id = v_rec.tenant_id
          AND m.sender_id = v_sender
          AND m.subject = v_subject
          AND m.created_at > now() - interval '10 minutes'
      );
      INSERT INTO internal_message_recipients (message_id, recipient_id)
      SELECT m.id, v_patient_user
        FROM internal_messages m
        LEFT JOIN internal_message_recipients r
               ON r.message_id = m.id AND r.recipient_id = v_patient_user
        WHERE m.tenant_id = v_rec.tenant_id
          AND m.sender_id = v_sender
          AND m.subject = v_subject
          AND m.created_at > now() - interval '10 minutes'
          AND r.id IS NULL;
    END IF;
  END IF;

  RETURN;
END;
$$;