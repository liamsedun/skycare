-- ============================================================================
-- SKYCARE — MIGRATION 0008: FULL HMS PORT (life-blossom features, multi-tenant)
-- Adds the hospital operating modules: staff, expenses, other_income,
-- doctor_notes, landing_doctors, internal_messages, chats, bank accounts,
-- duty roster, medical reports, push subscriptions, security events,
-- dependants, audit triggers, patient family RLS, and hardens role isolation
-- on clinical/billing tables. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUM EXTENSIONS (new values used by the payment declaration flow)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'bank_transfer';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'pos';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. PATIENTS — dependants + clinical extras (life-blossom parity)
-- ---------------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status text NOT NULL DEFAULT 'single';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_plan text NOT NULL DEFAULT 'individual';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS height_cm numeric(5,1);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS weight_kg numeric(5,1);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_rel text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_primary_account boolean NOT NULL DEFAULT true;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS primary_account_id uuid REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS dependant_relationship text;
CREATE INDEX IF NOT EXISTS idx_patients_primary_account ON patients (primary_account_id);

-- ---------------------------------------------------------------------------
-- 3. STAFF (linked to users; one row per staff member)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_number    text NOT NULL,
  department      text,
  specialization  text,
  license_number  text,
  years_of_exp    integer,
  qualification   text,
  employment_type text NOT NULL DEFAULT 'full_time',
  base_salary     numeric(12,2),
  is_available    boolean NOT NULL DEFAULT true,
  available_from  time,
  available_until time,
  on_leave_until  date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_number UNIQUE (tenant_id, staff_number),
  CONSTRAINT uq_staff_user UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff (tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_user  ON staff (user_id);
CREATE INDEX IF NOT EXISTS idx_staff_dept  ON staff (tenant_id, department);

-- ---------------------------------------------------------------------------
-- 4. EXPENSES + OTHER INCOME
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id    uuid REFERENCES branches(id) ON DELETE SET NULL,
  description  text NOT NULL,
  category     text NOT NULL,
  amount       numeric(12,2) NOT NULL,
  expense_date date NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  vendor       text,
  notes        text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_expense_positive CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses (tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_cat    ON expenses (tenant_id, category);

CREATE TABLE IF NOT EXISTS other_income (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  description   text NOT NULL,
  category      text NOT NULL,
  amount        numeric(12,2) NOT NULL,
  income_date   date NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  source        text,
  notes         text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_income_positive CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_other_income_tenant ON other_income (tenant_id, income_date);
CREATE INDEX IF NOT EXISTS idx_other_income_cat    ON other_income (tenant_id, category);

-- ---------------------------------------------------------------------------
-- 5. DOCTOR NOTES (structured clinical visit notes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_notes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id             uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id              uuid REFERENCES users(id) ON DELETE SET NULL,
  appointment_id         uuid REFERENCES appointments(id) ON DELETE SET NULL,
  visit_date             date NOT NULL DEFAULT CURRENT_DATE,
  vitals                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  tests_procedures       jsonb NOT NULL DEFAULT '{}'::jsonb,
  clinical_findings      text,
  diagnosis              jsonb NOT NULL DEFAULT '{}'::jsonb,
  medications            jsonb NOT NULL DEFAULT '[]'::jsonb,
  treatment_recommendations text,
  next_visit_date        date,
  next_visit_reason      text,
  is_confidential        boolean NOT NULL DEFAULT true,
  created_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_notes_tenant  ON doctor_notes (tenant_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_doctor_notes_patient ON doctor_notes (patient_id);

-- ---------------------------------------------------------------------------
-- 6. LANDING DOCTORS (public hospital website profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS landing_doctors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  specialty    text NOT NULL,
  available    boolean NOT NULL DEFAULT true,
  availability text NOT NULL DEFAULT '',
  image_url    text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landing_doctors_tenant ON landing_doctors (tenant_id, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- 7. INTERNAL MAIL
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  body            text NOT NULL,
  is_broadcast    boolean NOT NULL DEFAULT false,
  broadcast_scope text NOT NULL DEFAULT 'staff' CHECK (broadcast_scope IN ('staff','all')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_internal_messages_tenant ON internal_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_messages_sender ON internal_messages (sender_id);

CREATE TABLE IF NOT EXISTS internal_message_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read      boolean NOT NULL DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_internal_msg_recipient UNIQUE (message_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_internal_recipients_user ON internal_message_recipients (recipient_id, is_read);

-- ---------------------------------------------------------------------------
-- 8. CHAT (patient ↔ staff, realtime)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  staff_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message    text,
  last_sender_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_chat_pair UNIQUE (patient_id, staff_user_id)
);
CREATE INDEX IF NOT EXISTS idx_chats_tenant ON chats (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chats_staff ON chats (staff_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_patient ON chats (patient_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    text NOT NULL CHECK (length(btrim(message)) > 0),
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages (chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON chat_messages (chat_id, is_read) WHERE NOT is_read;

CREATE TABLE IF NOT EXISTS chat_presence (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_presence_tenant ON chat_presence (tenant_id, last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- 9. HOSPITAL BANK ACCOUNTS (payment declarations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hospital_bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_name      text NOT NULL,
  account_name   text NOT NULL,
  account_number text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant ON hospital_bank_accounts (tenant_id);

-- ---------------------------------------------------------------------------
-- 10. DUTY ROSTER
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS duty_roster (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  shift_date  date NOT NULL,
  from_time   time NOT NULL,
  until_time  time NOT NULL,
  note        text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_duty_roster_shift UNIQUE (staff_id, shift_date)
);
CREATE INDEX IF NOT EXISTS idx_duty_roster_tenant ON duty_roster (tenant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_duty_roster_user   ON duty_roster (user_id, shift_date);

-- ---------------------------------------------------------------------------
-- 11. MEDICAL REPORTS (official letterhead reports)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  reference_number text NOT NULL,
  report_date     date NOT NULL DEFAULT CURRENT_DATE,
  content         text NOT NULL,
  author_name     text NOT NULL,
  author_title    text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_medical_report_ref UNIQUE (tenant_id, reference_number)
);
CREATE INDEX IF NOT EXISTS idx_medical_reports_tenant ON medical_reports (tenant_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_medical_reports_patient ON medical_reports (patient_id);

-- ---------------------------------------------------------------------------
-- 12. PUSH SUBSCRIPTIONS (web push notifications)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint         text NOT NULL UNIQUE,
  subscription_json jsonb NOT NULL,
  device_name      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 13. SECURITY EVENTS (anomaly store, mirror of life-blossom migration-013)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for global failed-logins
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  severity    text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','high','critical')),
  description text NOT NULL,
  ip_address  text,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user   ON security_events (user_id);

-- ---------------------------------------------------------------------------
-- 14. AUDIT LOGS — extend with role / changes / description (append-only)
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes jsonb;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description text;

-- ---------------------------------------------------------------------------
-- 15. INVOICE VAT + ATTENDING STAFF (life-blossom migration-005 parity)
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attending_staff_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_attending ON invoices (attending_staff_id);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_percent numeric(5,2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 16. PRESCRIPTION ITEMS — free-text medication name (life-blossom parity)
-- ---------------------------------------------------------------------------
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS medication_name text;

-- ---------------------------------------------------------------------------
-- 17. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------
-- Family anchor check: is p_patient_id the primary account of the caller?
CREATE OR REPLACE FUNCTION public.is_family_primary(p_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM patients p
                 WHERE p.id = p_patient_id AND p.user_id = auth.uid());
$$;

-- All patient ids the caller may see (self + dependants linked to their primary account).
CREATE OR REPLACE FUNCTION public.family_patient_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ARRAY(
    SELECT p.id FROM patients p
    WHERE p.tenant_id = get_tenant_id()
      AND (p.user_id = auth.uid()
           OR (p.primary_account_id IS NOT NULL AND is_family_primary(p.primary_account_id)))
  );
$$;

-- Audit trigger: AFTER INSERT/UPDATE/DELETE on core clinical/billing tables.
-- Fires only when auth.uid() IS NOT NULL (RLS-scoped writes); service-role
-- writes are logged by the API layer instead (avoids double logging).
CREATE OR REPLACE FUNCTION public.jsonb_diff(old_row jsonb, new_row jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM (
    SELECT key, jsonb_build_object('old', o.value, 'new', n.value) AS value
    FROM jsonb_each(old_row) o
    FULL OUTER JOIN jsonb_each(new_row) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
  ) d;
$$;

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.get_role();
  v_tenant uuid := public.get_tenant_id();
  v_action public.audit_action;
  v_changes jsonb := NULL;
  v_entity_type text := TG_TABLE_NAME;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL; -- service-role writes: API layer logs
  END IF;
  IF TG_TABLE_NAME IN ('audit_logs','security_events') THEN
    RETURN NULL; -- never log the log
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

DROP TRIGGER IF EXISTS audit_medical_records ON medical_records;
DROP TRIGGER IF EXISTS audit_appointments   ON appointments;
DROP TRIGGER IF EXISTS audit_invoices       ON invoices;
DROP TRIGGER IF EXISTS audit_payments       ON payments;
DROP TRIGGER IF EXISTS audit_patients       ON patients;
DROP TRIGGER IF EXISTS audit_prescriptions  ON prescriptions;
DROP TRIGGER IF EXISTS audit_doctor_notes   ON doctor_notes;

CREATE TRIGGER audit_medical_records AFTER INSERT OR UPDATE OR DELETE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_appointments AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_patients AFTER INSERT OR UPDATE OR DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_prescriptions AFTER INSERT OR UPDATE OR DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_doctor_notes AFTER INSERT OR UPDATE OR DELETE ON doctor_notes
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ============================================================================
-- 18. RLS — ROLE ISOLATION HARDENING (replace permissive "any" policies)
-- The 0002 policies let ANY authenticated user with a tenant claim (including
-- patient_api) read/write clinical and billing tables. Replace with role-aware
-- policies: staff full access + patient self/family read-only.
-- ============================================================================

-- --- PATIENTS ---------------------------------------------------------------
DROP POLICY IF EXISTS patients_tenant_view ON patients;
DROP POLICY IF EXISTS patients_admin_write ON patients;
DROP POLICY IF EXISTS patients_self ON patients;
DROP POLICY IF EXISTS patients_any ON patients;
CREATE POLICY patients_staff_view ON patients FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY patients_staff_write ON patients
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY patients_self ON patients
  USING (tenant_id = get_tenant_id() AND is_patient() AND user_id = auth.uid())
  WITH CHECK (tenant_id = get_tenant_id() AND is_patient() AND user_id = auth.uid());
CREATE POLICY patients_family_self ON patients FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND (user_id = auth.uid()
              OR (primary_account_id IS NOT NULL AND is_family_primary(primary_account_id))));

-- --- APPOINTMENTS ------------------------------------------------------------
DROP POLICY IF EXISTS appointments_any ON appointments;
DROP POLICY IF EXISTS appointments_self ON appointments;
CREATE POLICY appointments_staff ON appointments
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY appointments_self ON appointments FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));

-- --- VISITS ------------------------------------------------------------------
DROP POLICY IF EXISTS visits_any ON visits;
DROP POLICY IF EXISTS visits_self ON visits;
CREATE POLICY visits_staff ON visits
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY visits_self ON visits FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));

-- --- MEDICAL RECORDS ---------------------------------------------------------
DROP POLICY IF EXISTS medical_records_read ON medical_records;
DROP POLICY IF EXISTS medical_records_write ON medical_records;
DROP POLICY IF EXISTS medical_records_self ON medical_records;
CREATE POLICY medical_records_staff_read ON medical_records FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY medical_records_staff_write ON medical_records
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY medical_records_self ON medical_records FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient() AND NOT is_confidential
         AND patient_id = ANY (public.family_patient_ids()));

-- --- BILLING -----------------------------------------------------------------
DROP POLICY IF EXISTS invoices_any ON invoices;
DROP POLICY IF EXISTS inv_items_any ON invoice_items;
DROP POLICY IF EXISTS payments_any ON payments;
DROP POLICY IF EXISTS invoices_self ON invoices;
CREATE POLICY invoices_staff ON invoices
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY invoices_self ON invoices FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));
CREATE POLICY inv_items_staff ON invoice_items
  USING (EXISTS (SELECT 1 FROM invoices i
                 WHERE i.id = invoice_items.invoice_id AND i.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i
                      WHERE i.id = invoice_items.invoice_id AND i.tenant_id = get_tenant_id()));
CREATE POLICY inv_items_self ON invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM invoices i
                 WHERE i.id = invoice_items.invoice_id AND i.tenant_id = get_tenant_id()
                   AND is_patient() AND i.patient_id = ANY (public.family_patient_ids())));
CREATE POLICY payments_staff ON payments
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY payments_self ON payments FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));

-- --- PRESCRIPTIONS -----------------------------------------------------------
DROP POLICY IF EXISTS prescriptions_any ON prescriptions;
DROP POLICY IF EXISTS rx_items_any ON prescription_items;
CREATE POLICY prescriptions_staff ON prescriptions
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY prescriptions_self ON prescriptions FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));
CREATE POLICY rx_items_staff ON prescription_items
  USING (EXISTS (SELECT 1 FROM prescriptions p
                 WHERE p.id = prescription_items.prescription_id AND p.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM prescriptions p
                      WHERE p.id = prescription_items.prescription_id AND p.tenant_id = get_tenant_id()));
CREATE POLICY rx_items_self ON prescription_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM prescriptions p
                 WHERE p.id = prescription_items.prescription_id AND p.tenant_id = get_tenant_id()
                   AND is_patient() AND p.patient_id = ANY (public.family_patient_ids())));

-- --- LAB (patient view of own results only; staff full) ----------------------
DROP POLICY IF EXISTS lab_orders_any ON lab_orders;
DROP POLICY IF EXISTS lab_results_len ON lab_results;
CREATE POLICY lab_orders_staff ON lab_orders
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY lab_orders_self ON lab_orders FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));
CREATE POLICY lab_results_staff ON lab_results
  USING (EXISTS (
    SELECT 1 FROM lab_order_tests lot
    JOIN lab_orders lo ON lo.id = lot.order_id
    WHERE lot.id = lab_results.order_test_id AND lo.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lab_order_tests lot
    JOIN lab_orders lo ON lo.id = lot.order_id
    WHERE lot.id = lab_results.order_test_id AND lo.tenant_id = get_tenant_id()));
CREATE POLICY lab_results_self ON lab_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM lab_order_tests lot
    JOIN lab_orders lo ON lo.id = lot.order_id
    WHERE lot.id = lab_results.order_test_id
      AND lo.tenant_id = get_tenant_id() AND is_patient()
      AND lo.patient_id = ANY (public.family_patient_ids())));

-- --- OPERATIONAL TABLES: staff-only (close patient read hole) ----------------
-- (old policy names are table-derived EXCEPT: po_any, grn_any, notif_tmpl_any,
--  leave_any, roster_any — dropped explicitly below)
DROP POLICY IF EXISTS po_any ON purchase_orders;
DROP POLICY IF EXISTS grn_any ON goods_receipts;
DROP POLICY IF EXISTS notif_tmpl_any ON notification_templates;
DROP POLICY IF EXISTS leave_any ON staff_leave;
DROP POLICY IF EXISTS roster_any ON staff_roster;
DROP POLICY IF EXISTS sub_inv_tenant ON subscription_invoices;
CREATE POLICY sub_inv_admin ON subscription_invoices FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_hospital_admin());
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['drugs','suppliers','purchase_orders','goods_receipts',
                          'requisitions','lab_tests','wards','admissions','staff_roster',
                          'attendance','staff_leave','notification_templates',
                          'analytics_daily','stock_movements']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_any', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_len', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin())) WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))',
                   t || '_staff', t);
  END LOOP;
END $$;

-- beds are children of wards
DROP POLICY IF EXISTS beds_len ON beds;
DROP POLICY IF EXISTS beds_any ON beds;
CREATE POLICY beds_staff ON beds
  USING (EXISTS (SELECT 1 FROM wards w WHERE w.id = beds.ward_id AND w.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM wards w WHERE w.id = beds.ward_id AND w.tenant_id = get_tenant_id()));

-- po_items / lab_order_tests child tables
DROP POLICY IF EXISTS po_items_len ON po_items;
CREATE POLICY po_items_staff ON po_items
  USING (EXISTS (SELECT 1 FROM purchase_orders po
                 WHERE po.id = po_items.po_id AND po.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM purchase_orders po
                      WHERE po.id = po_items.po_id AND po.tenant_id = get_tenant_id()));
DROP POLICY IF EXISTS lab_order_tests_len ON lab_order_tests;
CREATE POLICY lab_order_tests_staff ON lab_order_tests
  USING (EXISTS (SELECT 1 FROM lab_orders lo
                 WHERE lo.id = lab_order_tests.order_id AND lo.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM lab_orders lo
                      WHERE lo.id = lab_order_tests.order_id AND lo.tenant_id = get_tenant_id()));
DROP POLICY IF EXISTS drug_batches_len ON drug_batches;
CREATE POLICY drug_batches_staff ON drug_batches
  USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_batches.drug_id AND d.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_batches.drug_id AND d.tenant_id = get_tenant_id()));

-- --- NOTIFICATIONS (self + tenant staff) -------------------------------------
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications FOR SELECT
  USING (tenant_id = get_tenant_id() AND (user_id = auth.uid() OR is_staff() OR is_super_admin()));
CREATE POLICY notifications_write ON notifications
  USING (tenant_id = get_tenant_id() AND is_staff())
  WITH CHECK (tenant_id = get_tenant_id() AND is_staff());

-- ============================================================================
-- 19. RLS — NEW TABLES
-- ============================================================================

-- --- STAFF -------------------------------------------------------------------
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_self ON staff FOR SELECT
  USING (tenant_id = get_tenant_id() AND user_id = auth.uid());
CREATE POLICY staff_tenant_read ON staff FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY staff_admin_write ON staff
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()));

-- --- EXPENSES / OTHER INCOME (billing roles) ---------------------------------
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_billing ON expenses
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','cashier','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','cashier','super_admin')));
ALTER TABLE other_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY other_income_billing ON other_income
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','cashier','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','cashier','super_admin')));

-- --- DOCTOR NOTES -------------------------------------------------------------
ALTER TABLE doctor_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY doctor_notes_clinical ON doctor_notes
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','doctor','nurse','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','doctor','nurse','super_admin')));
CREATE POLICY doctor_notes_patient ON doctor_notes FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient() AND NOT is_confidential
         AND patient_id = ANY (public.family_patient_ids()));

-- --- LANDING DOCTORS (public site: anon read of active; admin writes) ---------
ALTER TABLE landing_doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY landing_doctors_public ON landing_doctors FOR SELECT
  USING (is_active = true AND auth.role() = 'anon');
CREATE POLICY landing_doctors_tenant ON landing_doctors FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY landing_doctors_admin ON landing_doctors
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()));

-- --- INTERNAL MAIL ------------------------------------------------------------
ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_message_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY internal_messages_read ON internal_messages FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY internal_messages_write ON internal_messages
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY internal_recipients_read ON internal_message_recipients FOR SELECT
  USING (EXISTS (SELECT 1 FROM internal_messages m
                 WHERE m.id = internal_message_recipients.message_id AND m.tenant_id = get_tenant_id()));
CREATE POLICY internal_recipients_write ON internal_message_recipients
  USING (EXISTS (SELECT 1 FROM internal_messages m
                 WHERE m.id = internal_message_recipients.message_id AND m.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM internal_messages m
                      WHERE m.id = internal_message_recipients.message_id AND m.tenant_id = get_tenant_id()));

-- --- CHAT (participants only) --------------------------------------------------
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY chats_participant ON chats FOR SELECT
  USING (tenant_id = get_tenant_id()
         AND (staff_user_id = auth.uid()
              OR patient_id = ANY (public.family_patient_ids())
              OR is_super_admin()));
CREATE POLICY chats_write ON chats
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY chat_messages_read ON chat_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM chats c WHERE c.id = chat_messages.chat_id
                 AND c.tenant_id = get_tenant_id()
                 AND (c.staff_user_id = auth.uid()
                      OR c.patient_id = ANY (public.family_patient_ids()))));
CREATE POLICY chat_messages_write ON chat_messages
  USING (EXISTS (SELECT 1 FROM chats c WHERE c.id = chat_messages.chat_id
                 AND c.tenant_id = get_tenant_id()
                 AND (c.staff_user_id = auth.uid()
                      OR c.patient_id = ANY (public.family_patient_ids()))))
  WITH CHECK (EXISTS (SELECT 1 FROM chats c WHERE c.id = chat_messages.chat_id
                 AND c.tenant_id = get_tenant_id()
                 AND (c.staff_user_id = auth.uid()
                      OR c.patient_id = ANY (public.family_patient_ids()))));
CREATE POLICY chat_presence_read ON chat_presence FOR SELECT
  USING (tenant_id = get_tenant_id());
CREATE POLICY chat_presence_self ON chat_presence
  USING (user_id = auth.uid() AND tenant_id = get_tenant_id())
  WITH CHECK (user_id = auth.uid() AND tenant_id = get_tenant_id());

-- --- BANK ACCOUNTS -------------------------------------------------------------
ALTER TABLE hospital_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY bank_accounts_read ON hospital_bank_accounts FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY bank_accounts_write ON hospital_bank_accounts
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','cashier','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','cashier','super_admin')));

-- --- DUTY ROSTER ----------------------------------------------------------------
ALTER TABLE duty_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY duty_roster_read ON duty_roster FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY duty_roster_admin ON duty_roster
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_role() = 'cashier' OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_role() = 'cashier' OR is_super_admin()));

-- --- MEDICAL REPORTS -------------------------------------------------------------
ALTER TABLE medical_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY medical_reports_staff_read ON medical_reports FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY medical_reports_clinical ON medical_reports
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','doctor','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','doctor','super_admin')));
CREATE POLICY medical_reports_patient ON medical_reports FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient()
         AND patient_id = ANY (public.family_patient_ids()));

-- --- PUSH SUBSCRIPTIONS (self) -----------------------------------------------------
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subs_self ON push_subscriptions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- --- SECURITY EVENTS ---------------------------------------------------------------
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY security_events_admin_read ON security_events FOR SELECT
  USING ((tenant_id = get_tenant_id() AND is_hospital_admin()) OR is_super_admin() OR tenant_id IS NULL);

-- --- AUDIT (append-only; SELECT for admins) ----------------------------------------
DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (is_hospital_admin() AND (tenant_id = get_tenant_id() OR is_super_admin()));

-- ============================================================================
-- 20. ANALYTICS VIEWS — close the cross-tenant leak (security_invoker + RLS)
-- ============================================================================
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE VIEW v_revenue_monthly
WITH (security_invoker = true) AS
SELECT tenant_id, branch_id, date_trunc('month', "date")::date AS month,
       SUM(total_revenue) AS revenue
FROM analytics_daily
GROUP BY tenant_id, branch_id, date_trunc('month', "date");

CREATE OR REPLACE VIEW v_appointment_insights
WITH (security_invoker = true) AS
SELECT tenant_id, branch_id, "date",
       total_appointments, completed_appointments, no_show_appointments,
       CASE WHEN total_appointments > 0
            THEN ROUND(100.0 * completed_appointments / total_appointments, 2)
            ELSE 0 END AS completion_rate
FROM analytics_daily;

-- ============================================================================
-- 21. PUBLIC GRANTS (new tables must not be anon-readable)
-- ============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON public.tenants, public.branches, public.landing_doctors TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- ============================================================================
-- 22. UPDATE TIMESTAMP TRIGGERS (new tables)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff','expenses','other_income','doctor_notes',
                           'landing_doctors','chats','hospital_bank_accounts',
                           'medical_reports','push_subscriptions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.update_timestamp()', t, t);
  END LOOP;
END $$;
