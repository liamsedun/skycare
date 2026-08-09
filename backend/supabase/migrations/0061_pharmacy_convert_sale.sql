-- ============================================================================
-- SKYCARE — MIGRATION 0061: PHARMACY CONVERT-TO-SALE + BANK LEDGER
--
-- Part of the new prescription → sale workflow:
--   * pharmacy staff convert pending prescriptions in Billing & Sales,
--   * choose in-house (patient billed, stock issued, outstanding tracked),
--     walk-in (cash/transfer collected now, bank ledger credited) or
--     external pharmacy (closed, patient mailed the medication list).
--
-- This migration adds:
--   1. pharmacy_bank_ledger — a dedicated bank-account ledger. Every recorded
--      pharmacy payment (cash/POS/transfer/card, any sale) posts an 'in'
--      entry against the first active hospital bank account, so the bank side
--      of 'bank debited / stock credited' is always reconcilable. Writes flow
--      through the API layer (service client, audit-logged); RLS is read-only
--      for staff, mirroring the other pharmacy tables.
--   2. notify_prescription_event('closed') — terminal event used when a
--      prescription is closed by the pharmacy (external → patient receives
--      Internal Mail with the medication list to buy out-of-house).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. BANK LEDGER
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_bank_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  account_id uuid REFERENCES hospital_bank_accounts(id) ON DELETE SET NULL,
  direction  text NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
  amount     numeric(12,2) NOT NULL CHECK (amount > 0),
  source     text NOT NULL DEFAULT 'pharmacy_payment'
             CHECK (source IN ('pharmacy_payment','sale','refund','adjustment')),
  source_ref text,
  invoice_id uuid REFERENCES pharmacy_invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES pharmacy_payments(id) ON DELETE SET NULL,
  method     text,
  reference  text,
  notes      text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bank_ledger_tenant_date
  ON pharmacy_bank_ledger (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bank_ledger_account
  ON pharmacy_bank_ledger (tenant_id, account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_bank_ledger_payment
  ON pharmacy_bank_ledger (tenant_id, payment_id);

ALTER TABLE pharmacy_bank_ledger ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE tablename = 'pharmacy_bank_ledger'
                    AND policyname = 'pharmacy_bank_ledger_staff_read') THEN
    CREATE POLICY pharmacy_bank_ledger_staff_read ON pharmacy_bank_ledger
      FOR SELECT TO authenticated
      USING ((auth.jwt() ->> 'role') IN
        ('hospital_admin', 'pharmacist', 'cashier', 'doctor', 'nurse', 'super_admin'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. CLOSED EVENT ON notify_prescription_event
--    When pharmacy staff close a prescription (external route), the patient's
--    portal account receives Internal Mail carrying the medication list to
--    buy from the named external pharmacy — the same copy they get at
--    'created', now sent again on final closure.
-- ---------------------------------------------------------------------------
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
  ELSIF p_event = 'closed' THEN
    v_subject := v_subject || ' closed';
    v_body := 'Your prescription has been closed.';
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

  -- patient copy (dependant -> primary account holder);
  -- the medication list is the actionable text for external prescriptions
  -- (created new prescription AND closed by the pharmacy).
  INSERT INTO notifications (tenant_id, patient_id, channel, event, title, message,
                             reference_type, reference_id, status)
  VALUES (v_rec.tenant_id, v_rec.notify_patient_id, 'in_app', 'prescription_' || p_event,
          v_subject,
          CASE WHEN v_rec.pharmacy_type = 'external' AND p_event IN ('created', 'closed')
               THEN 'Take this prescription to ' || COALESCE(v_rec.external_pharmacy_name, 'your preferred pharmacy')
                    || ':' || E'\n' || v_drugs
                    || E'\n\nFollow the instructions on the prescription.'
               ELSE v_body
          END,
          'prescriptions', p_prescription_id, 'sent');

  -- ==========================================================================
  -- INTERNAL MAIL FAN-OUT: same audiences, same events, via Mailbox.
  -- Sender = the prescribing doctor; patient recipient = the portal account
  -- holding the patient's record (dependant -> parent). Skipped when there is
  -- no suitable sender or no portal account.
  -- ==========================================================================
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
             CASE WHEN v_rec.pharmacy_type = 'external' AND p_event IN ('created', 'closed')
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
      -- messages and recipients can't be linked in one statement: if the row
      -- above was deduped, link any recent matching message instead.
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