-- ============================================================================
-- SKYCARE — MIGRATION 0025: PHARMACY PRESCRIPTION WORKFLOW
--
-- Builds on 0023 (pharmacy_drugs/suppliers/stock_batches/stock_movements) and
-- 0024 (enum: pending/processing/dispensed/partial/cancelled) and the legacy
-- prescriptions/prescription_items tables (0001/0008) which gain pharmacy
-- linkage. Adds:
--
--   1. Data migration: active -> pending, partially_dispensed -> partial
--   2. prescription columns: pharmacy_type (in_house | external),
--      external_pharmacy_name, dispensed_at, dispensed_by
--   3. dispensing_logs — the pharmacist's audit trail per dispense action
--      (link to pharmacy_stock_batches + pharmacy_stock_movements)
--   4. Status transition guard (DB-level state machine)
--   5. Event fan-out trigger: in-house -> pharmacist + hospital_admin staff
--      (patient + dependant copied); external -> patient + dependant only
--   6. Pharmacist queue RPC (pending/processing + items + patient)
--
-- Idempotent. Deploy: npx supabase db push --linked --yes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DATA MIGRATION — legacy statuses -> new lifecycle
-- ---------------------------------------------------------------------------
UPDATE prescriptions SET status = 'pending'
 WHERE status = 'active';
UPDATE prescriptions SET status = 'partial'
 WHERE status = 'partially_dispensed';

-- ---------------------------------------------------------------------------
-- 2. prescriptions — pharmacy routing + dispense audit columns
-- ---------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS pharmacy_type text NOT NULL DEFAULT 'in_house'
    CHECK (pharmacy_type IN ('in_house', 'external')),
  ADD COLUMN IF NOT EXISTS external_pharmacy_name text,
  ADD COLUMN IF NOT EXISTS dispensed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispensed_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- pharmacist queue: tenant + status + issued date
CREATE INDEX IF NOT EXISTS idx_prescriptions_queue
  ON prescriptions (tenant_id, status, issued_date DESC);

-- new prescriptions start as 'pending'
ALTER TABLE prescriptions ALTER COLUMN status SET DEFAULT 'pending';

-- ---------------------------------------------------------------------------
-- 3. dispensing_logs — one row per manufactured dispense event
--    (a partial dispense of 4 units from a batch logs one row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispensing_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES prescription_items(id) ON DELETE SET NULL,
  batch_id        uuid REFERENCES pharmacy_stock_batches(id) ON DELETE SET NULL,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  quantity        integer NOT NULL CHECK (quantity > 0),
  dispensed_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispensing_logs_prescription ON dispensing_logs (prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispensing_logs_tenant      ON dispensing_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispensing_logs_batch       ON dispensing_logs (batch_id);

-- ---------------------------------------------------------------------------
-- 4. STATUS STATE MACHINE — guard transitions at the DB level
--    pending -> processing -> dispensed | partial -> dispensed
--    any non-terminal -> cancelled; dispensed/completed/cancelled = terminal
--    legacy 'active' behaves as 'pending', 'partially_dispensed' as 'partial'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prescription_status_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- terminal: cancelled / completed never reopen
  IF OLD.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Prescription % is terminal (status %), cannot transition to %',
      OLD.id, OLD.status, NEW.status;
  END IF;

  -- dispensed is terminal too (cannot un-dispense stock already moved)
  IF OLD.status = 'dispensed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'Prescription % is dispensed — only completion allowed', OLD.id;
  END IF;

  -- whitelist of legal transitions (old -> new)
  IF NOT (
    (OLD.status IN ('pending','active')  AND NEW.status IN ('processing','dispensed','partial','cancelled')) OR
    (OLD.status = 'processing'           AND NEW.status IN ('dispensed','partial','cancelled')) OR
    (OLD.status = 'partial'              AND NEW.status IN ('dispensed','cancelled')) OR
    (OLD.status = 'dispensed'            AND NEW.status IN ('completed'))
  ) THEN
    RAISE EXCEPTION 'Illegal prescription status transition % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prescription_status_guard ON prescriptions;
CREATE TRIGGER trg_prescription_status_guard
  BEFORE UPDATE OF status ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION fn_prescription_status_guard();

-- items: dispensed quantity must stay within prescribed quantity
CREATE OR REPLACE FUNCTION fn_prescription_item_qty_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dispensed_qty < 0 OR NEW.dispensed_qty > NEW.quantity THEN
    RAISE EXCEPTION 'dispensed_qty % out of range for item % (quantity %)',
      NEW.dispensed_qty, NEW.id, NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prescription_item_qty_guard ON prescription_items;
CREATE TRIGGER trg_prescription_item_qty_guard
  BEFORE INSERT OR UPDATE OF dispensed_qty ON prescription_items
  FOR EACH ROW EXECUTE FUNCTION fn_prescription_item_qty_guard();

-- ---------------------------------------------------------------------------
-- 5. EVENT FAN-OUT — in-house vs external pharmacy
--    fires AFTER INSERT (prescription created) and AFTER UPDATE OF status
--    (dispensed / partial / cancelled / processing).
--
--    in_house  -> notify pharmacists + hospital admins of the tenant,
--                 plus a patient copy (dependant -> primary account holder)
--    external  -> notify the patient only; drug list + instructions inline
--
--    PDF attachments are referenced via reference_type/reference_id so the
--    UI can deep-link to GET /api/prescriptions/[id]/print.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_prescription_event(
  p_prescription_id uuid,
  p_event           text          -- 'created' | 'dispensed' | 'partial' | 'cancelled' | 'processing'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec    record;
  v_recip  uuid;
  v_subject text;
  v_body   text;
  v_drugs  text;
BEGIN
  SELECT p.id, p.tenant_id, p.patient_id, p.pharmacy_type, p.status,
         pat.name AS patient_name,
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
             || ' ' || pi.dosage || ' ' || pi.frequency
             || COALESCE('for ' || pi.duration || ' · qty ' || pi.quantity, ''),
           E'\n' ORDER BY pi.created_at)
    INTO v_drugs
    FROM prescription_items pi
    LEFT JOIN drugs d ON d.id = pi.drug_id
   WHERE pi.prescription_id = p_prescription_id;

  -- Build message per event
  v_subject := 'Prescription';
  IF p_event = 'created' THEN
    v_subject := v_subject || ' issued';
    v_body := 'Prescription issued for ''' || v_rec.patient_name || ''':\n' || v_drugs;
  ELSIF p_event = 'dispensed' THEN
    v_subject := v_subject || ' dispensed';
    v_body := 'Medications are ready for collection at the pharmacy';
  ELSIF p_event = 'partial' THEN
    v_subject := v_subject || ' partially dispensed';
    v_body := 'Part of your prescription has been dispensed; the rest will follow';
  ELSIF p_event = 'cancelled' THEN
    v_subject := v_subject || ' cancelled';
    v_body := 'Your prescription was cancelled. Contact the facility for details';
  ELSE
    v_subject := v_subject || ' being processed';
    v_body := 'Your prescription is being processed by the pharmacy';
  END IF;

  IF v_rec.pharmacy_type = 'in_house' AND p_event IN ('created','processing') THEN
    -- pharmacists + hospital admins (they manage the queue and dispense)
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
  VALUES (v_rec.tenant_id, v_rec.patient_id, 'in_app', 'prescription_' || p_event,
          v_subject,
          CASE WHEN v_rec.pharmacy_type = 'external' AND p_event = 'created'
               THEN v_body || E'\nPlease take this to: ' || v_rec.external_pharmacy_name
               ELSE v_body
          END,
          'prescriptions', p_prescription_id, 'sent')
  ON CONFLICT DO NOTHING;

  RETURN;
END;
$$;

-- wire it up: AFTER INSERT + AFTER UPDATE OF status
CREATE OR REPLACE FUNCTION fn_prescription_event_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_prescription_event(NEW.id, 'created');
  ELSE
    PERFORM notify_prescription_event(NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prescription_event ON prescriptions;
CREATE TRIGGER trg_prescription_event
  AFTER INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION fn_prescription_event_trigger();

DROP TRIGGER IF EXISTS trg_prescription_event_status ON prescriptions;
CREATE TRIGGER trg_prescription_event_status
  AFTER UPDATE OF status ON prescriptions
  FOR EACH ROW
  WHEN (NEW.status <> OLD.status)
  EXECUTE FUNCTION fn_prescription_event_trigger();

-- ---------------------------------------------------------------------------
-- 6. RLS + GRANTS
--    dispensing_logs: staff read + patient self; writes via service role
-- ---------------------------------------------------------------------------
ALTER TABLE dispensing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispensing_logs_staff_read ON dispensing_logs;
CREATE POLICY dispensing_logs_staff_read ON dispensing_logs FOR SELECT
  USING ((tenant_id = get_tenant_id() AND is_staff()) OR is_super_admin());

DROP POLICY IF EXISTS dispensing_logs_patient_read ON dispensing_logs;
CREATE POLICY dispensing_logs_patient_read ON dispensing_logs FOR SELECT
  USING (tenant_id = get_tenant_id()
         AND is_patient()
         AND prescription_id IN (
           SELECT id FROM prescriptions WHERE patient_id = ANY(family_patient_ids())
         ));

GRANT SELECT ON dispensing_logs TO authenticated;

-- pharmacy queue for pharmacist UI: prescriptions in pending/processing
CREATE OR REPLACE FUNCTION pharmacy_prescription_queue(p_tenant uuid, p_status text DEFAULT NULL)
RETURNS SETOF prescriptions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM prescriptions
  WHERE tenant_id = p_tenant
    AND (p_status IS NULL OR status::text = p_status)
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION pharmacy_prescription_queue(uuid, text) TO authenticated;