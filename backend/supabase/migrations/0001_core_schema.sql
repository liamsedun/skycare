-- ============================================================================
-- SKYCARE — MIGRATION 0001: MULTI-TENANT CORE SCHEMA
-- Supabase / PostgreSQL 15+. Idempotent.
--
-- Every operational table carries tenant_id; hot tables additionally carry
-- branch_id for the optional branch layer. RLS is enabled in migration 0002.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE tenant_plan AS ENUM ('basic', 'pro', 'enterprise', 'custom');
CREATE TYPE app_role    AS ENUM ('super_admin', 'hospital_admin', 'doctor', 'nurse',
                                 'pharmacist', 'lab_tech', 'cashier', 'receptionist', 'patient_api');

CREATE TYPE patient_status     AS ENUM ('active', 'inactive', 'deceased', 'transferred');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed',
                                        'cancelled', 'no_show');
CREATE TYPE visit_type         AS ENUM ('outpatient', 'inpatient', 'emergency', 'review', 'follow_up');
CREATE TYPE invoice_status     AS ENUM ('draft', 'pending', 'partially_paid', 'paid',
                                        'cancelled', 'refunded');
CREATE TYPE payment_method     AS ENUM ('cash', 'card', 'transfer', 'mobile_money', 'insurance',
                                        'nhia', 'bank_deposit');
CREATE TYPE payment_status     AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE prescription_status AS ENUM ('active', 'completed', 'cancelled', 'dispensed', 'partially_dispensed');
CREATE TYPE requisition_status  AS ENUM ('pending', 'approved', 'issued', 'rejected', 'fulfilled');
CREATE TYPE po_status           AS ENUM ('draft', 'sent', 'partially_received', 'received', 'cancelled');
CREATE TYPE stock_status        AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'expired', 'disposed');
CREATE TYPE lab_order_status    AS ENUM ('requested', 'sample_collected', 'in_progress', 'completed', 'cancelled');
CREATE TYPE admission_status    AS ENUM ('admitted', 'transferred', 'discharged');
CREATE TYPE attendance_status   AS ENUM ('present', 'absent', 'late', 'on_leave');
CREATE TYPE audit_action        AS ENUM ('create', 'update', 'delete', 'view', 'login', 'logout',
                                         'login_failed', 'export', 'permission_denied');

-- ---------------------------------------------------------------------------
-- TENANT ROOT
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,              -- hospitalname.skycare.app
  domain       text UNIQUE,                        -- optional custom domain
  email        text,
  phone        text,
  address      text,
  city         text,
  state        text,
  country      text NOT NULL DEFAULT 'Nigeria',
  logo_url     text,
  brand_color  text DEFAULT '#0ea5e9',
  plan      tenant_plan NOT NULL DEFAULT 'basic',
  currency     text NOT NULL DEFAULT 'NGN',
  timezone     text NOT NULL DEFAULT 'Africa/Lagos',
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  website      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- hospital website generator content
  is_active    boolean NOT NULL DEFAULT true,
  trial_ends_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- BRANCH (multi-location hospital network)
-- ---------------------------------------------------------------------------
CREATE TABLE branches (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name      text NOT NULL,
  code      text,
  address   text,
  city      text,
  state     text,
  phone     text,
  email     text,
  is_main   boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- USERS - mirrors Supabase auth.users; one row per authenticated user.
-- tenant_id points at the tenant the user belongs to. super_admin has NULL
-- tenant_id (platform-wide).
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for platform super_admin
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL, -- NULL => any/all branches
  email      text NOT NULL,
  password_hash text,  -- for edge-function auth flows / OTP; Supabase Auth is primary
  full_name  text NOT NULL,
  role       app_role NOT NULL,
  phone      text,
  avatar_url text,
  is_active  boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users (tenant_id);
CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_role     ON users (tenant_id, role);
-- platform super_admin rows have tenant_id NULL; keep their emails unique
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_platform_email ON users (email) WHERE tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- PATIENT
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  primary_branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_number text NOT NULL,                 -- hospital-specific unique (PT-####)
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  other_names    text,
  gender         text CHECK (gender IN ('male','female','other')),
  date_of_birth  date,
  phone          text,
  email          text,
  address        text,
  city           text,
  state          text,
  blood_group    text CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  genotype       text,
  allergies      text,
  chronic_conditions text,
  nhia_number    text,                    -- Nigerian Health Insurance Authority
  insurance_provider text,
  insurance_plan text,
  next_of_kin    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_insured       boolean NOT NULL DEFAULT false,
  status        patient_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_patient_number UNIQUE (tenant_id, patient_number)
);
CREATE INDEX idx_patients_tenant   ON patients (tenant_id);
CREATE INDEX idx_patients_branch   ON patients (tenant_id, branch_id);
CREATE INDEX idx_patients_name     ON patients (tenant_id, last_name, first_name);
CREATE INDEX idx_patients_phone    ON patients (tenant_id, phone);
CREATE INDEX idx_patients_nhia     ON patients (tenant_id, nhia_number);

-- ---------------------------------------------------------------------------
-- APPOINTMENT
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time   time,
  type       text NOT NULL DEFAULT 'in_person' CHECK (type IN ('in_person','video_call','telephone')),
  status     appointment_status NOT NULL DEFAULT 'scheduled',
  reason     text,
  notes      text,
  reminder_sent boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appointments_tenant ON appointments (tenant_id);
CREATE INDEX idx_appointments_branch ON appointments (tenant_id, branch_id, scheduled_date);
CREATE INDEX idx_appointments_patient ON appointments (patient_id);
CREATE INDEX idx_appointments_doctor  ON appointments (doctor_id, scheduled_date);
CREATE INDEX idx_appointments_status  ON appointments (tenant_id, status);

-- ---------------------------------------------------------------------------
-- VISIT / ENCOUNTER
-- ---------------------------------------------------------------------------
CREATE TABLE visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id    uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id   uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  visit_type   visit_type NOT NULL DEFAULT 'outpatient',
  visit_date   date NOT NULL DEFAULT CURRENT_DATE,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  chief_complaint text,
  diagnosis    text,
  notes        text,
  follow_up_date date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_visits_tenant ON visits (tenant_id);
CREATE INDEX idx_visits_patient ON visits (patient_id, visit_date);
CREATE INDEX idx_visits_date   ON visits (tenant_id, visit_date);

-- ---------------------------------------------------------------------------
-- MEDICAL RECORDS (EHR)
-- ---------------------------------------------------------------------------
CREATE TABLE medical_records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id   uuid REFERENCES visits(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id),
  record_type text NOT NULL CHECK (record_type IN ('diagnosis','lab_result','prescription','surgery_report',
                                                     'vaccination','imaging','progress_note','admission_summary','discharge_summary')),
  title      text NOT NULL,
  content    text,
  attachments text[],
  is_confidential boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_medical_records_patient ON medical_records (patient_id);
CREATE INDEX idx_medical_records_tenant  ON medical_records (tenant_id, created_at);

-- ---------------------------------------------------------------------------
-- BILLING
-- ---------------------------------------------------------------------------
CREATE TABLE invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  issue_date    date NOT NULL DEFAULT CURRENT_DATE,
  due_date      date,
  status        invoice_status NOT NULL DEFAULT 'draft',
  subtotal      numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount    numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount  numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount   numeric(12,2) NOT NULL DEFAULT 0,
  insurance_claimable boolean NOT NULL DEFAULT false,
  notes         text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_invoice_number UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX idx_invoices_patient ON invoices (patient_id);
CREATE INDEX idx_invoices_tenant  ON invoices (tenant_id, status);

CREATE TABLE invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    integer NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL,
  total_price numeric(12,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoice_positive CHECK (quantity > 0 AND unit_price >= 0)
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items (invoice_id);

CREATE TABLE payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id     uuid REFERENCES invoices(id) ON DELETE SET NULL,
  patient_id     uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL,
  payment_method payment_method NOT NULL,
  status         payment_status NOT NULL DEFAULT 'pending',
  reference      text,
  gateway        text,   -- paystack | flutterwave | mono | offline
  metadata       jsonb,
  paid_by        uuid REFERENCES users(id),
  paid_at        timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_positive CHECK (amount > 0)
);
CREATE INDEX idx_payments_patient ON payments (patient_id);
CREATE INDEX idx_payments_invoice ON payments (invoice_id);
CREATE INDEX idx_payments_tenant  ON payments (tenant_id, paid_at);
CREATE UNIQUE INDEX idx_payments_reference ON payments (reference) WHERE reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- PHARMACY / INVENTORY
-- ---------------------------------------------------------------------------
CREATE TABLE drugs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,   -- NULL = shared/central
  name        text NOT NULL,
  generic_name text,
  sku         text,
  category    text,          -- analgesic, antibiotic, ...
  unit        text,          -- tablet, ml, mg, vial, sachet
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 10,
  requires_rx boolean NOT NULL DEFAULT true,
  is_controlled boolean NOT NULL DEFAULT false,   -- NAFDAC / controlled drug
  nafdac_number text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_drug_sku UNIQUE (tenant_id, sku) 
);
CREATE INDEX idx_drugs_tenant ON drugs (tenant_id);
CREATE INDEX idx_drugs_branch ON drugs (tenant_id, branch_id);

CREATE TABLE drug_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id     uuid NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  expiry_date date NOT NULL,
  quantity_on_hand integer NOT NULL DEFAULT 0,
  cost_price  numeric(12,2),
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_drug_batches_drug ON drug_batches (drug_id, expiry_date);

CREATE TABLE stock_movements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  drug_id      uuid NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  batch_id     uuid REFERENCES drug_batches(id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('in','out','adjust','transfer_in','transfer_out','dispense','waste')),
  quantity     integer NOT NULL,
  source_ref   text,            -- invoice / PO / requisition id
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_stock_movement CHECK (quantity != 0)
);
CREATE INDEX idx_stock_movements_drug ON stock_movements (drug_id, created_at DESC);

CREATE TABLE prescriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id      uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  visit_id        uuid REFERENCES visits(id) ON DELETE SET NULL,
  diagnosis       text,
  notes           text,
  status          prescription_status NOT NULL DEFAULT 'active',
  issued_date     date NOT NULL DEFAULT CURRENT_DATE,
  expires_date    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prescriptions_patient ON prescriptions (patient_id);
CREATE INDEX idx_prescriptions_tenant  ON prescriptions (tenant_id, status);

CREATE TABLE prescription_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_id         uuid REFERENCES drugs(id) ON DELETE SET NULL,
  dosage          text NOT NULL,
  frequency       text NOT NULL,
  route           text DEFAULT 'oral',
  duration        text,
  quantity        integer NOT NULL,
  refills         integer NOT NULL DEFAULT 0,
  dispensed_qty   integer NOT NULL DEFAULT 0,
  instructions    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prescription_items_prescription ON prescription_items (prescription_id);

-- ---------------------------------------------------------------------------
-- SUPPLY CHAIN
-- ---------------------------------------------------------------------------
CREATE TABLE suppliers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  contact    text,
  phone      text,
  email      text,
  address    text,
  nafdac_license text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_supplier_tenant UNIQUE (tenant_id, name)
);
CREATE INDEX idx_suppliers_tenant ON suppliers (tenant_id);

CREATE TABLE purchase_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  po_number   text NOT NULL,
  order_date  date NOT NULL DEFAULT CURRENT_DATE,
  expected_by date,
  status      po_status NOT NULL DEFAULT 'draft',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes       text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_po_number UNIQUE (tenant_id, po_number)
);
CREATE INDEX idx_po_tenant ON purchase_orders (tenant_id, status);

CREATE TABLE po_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id      uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  drug_id    uuid REFERENCES drugs(id) ON DELETE SET NULL,
  item_name  text NOT NULL,
  quantity_ordered integer NOT NULL,
  quantity_received integer NOT NULL DEFAULT 0,
  unit_cost  numeric(12,2) NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_items ON po_items (po_id);

-- goods receipt note (GRN)
CREATE TABLE goods_receipts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  po_id      uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  grn_number text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES users(id),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_grn_number UNIQUE (tenant_id, grn_number)
);
CREATE INDEX idx_grn_tenant ON goods_receipts (tenant_id);

CREATE TABLE requisitions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES users(id),
  item       text NOT NULL,
  quantity   integer NOT NULL,
  remarks    text,
  status         requisition_status NOT NULL DEFAULT 'pending',
  approved_by    uuid REFERENCES users(id),
  issued_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_requisitions_tenant ON requisitions (tenant_id, status);

-- ---------------------------------------------------------------------------
-- LABORATORY
-- ---------------------------------------------------------------------------
CREATE TABLE lab_tests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  category   text,          -- chemistry, hematology, microbiology, radiology, ...
  price      numeric(12,2) NOT NULL DEFAULT 0,
  reference_range text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lab_test_tenant UNIQUE (tenant_id, name)
);
CREATE INDEX idx_lab_tests_tenant ON lab_tests (tenant_id);

CREATE TABLE lab_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id  uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  visit_id    uuid REFERENCES visits(id) ON DELETE SET NULL,
  status      lab_order_status NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes       text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lab_orders_tenant  ON lab_orders (tenant_id, status);
CREATE INDEX idx_lab_orders_patient ON lab_orders (patient_id);

CREATE TABLE lab_order_tests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_id    uuid REFERENCES lab_tests(id) ON DELETE SET NULL,
  test_name  text NOT NULL,
  sample_type text,
  priority   text DEFAULT 'routine' CHECK (priority IN ('routine','urgent','stat')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lab_order_tests ON lab_order_tests (order_id);

CREATE TABLE lab_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_test_id uuid NOT NULL REFERENCES lab_order_tests(id) ON DELETE CASCADE,
  result        text,
  unit          text,
  is_abnormal   boolean NOT NULL DEFAULT false,
  uploaded_by   uuid REFERENCES users(id),
  result_file_url text,
  reported_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lab_results_order ON lab_results (order_test_id);

-- ---------------------------------------------------------------------------
-- WARD / BED / ADMISSION
-- ---------------------------------------------------------------------------
CREATE TABLE wards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  name       text NOT NULL,
  ward_type  text CHECK (ward_type IN ('general','private','icu','maternity','surgical','pediatric','observation')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ward_tenant UNIQUE (tenant_id, name)
);
CREATE INDEX idx_wards_tenant ON wards (tenant_id);

CREATE TABLE beds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id     uuid NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  bed_number  text NOT NULL,
  status      text NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','maintenance','cleaning')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bed_number UNIQUE (ward_id, bed_number)
);
CREATE INDEX idx_beds_ward ON beds (ward_id, status);

CREATE TABLE admissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  patient_id     uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id       uuid REFERENCES visits(id) ON DELETE SET NULL,
  bed_id         uuid REFERENCES beds(id) ON DELETE SET NULL,
  admitted_at    timestamptz NOT NULL DEFAULT now(),
  discharged_at  timestamptz,
  expected_discharge date,
  admitting_doctor uuid REFERENCES users(id),
  status         admission_status NOT NULL DEFAULT 'admitted',
  diagnosis_at_admission text,
  notes          text,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admissions_tenant  ON admissions (tenant_id, status);
CREATE INDEX idx_admissions_patient ON admissions (patient_id);

-- ---------------------------------------------------------------------------
-- STAFF / HR
-- ---------------------------------------------------------------------------
CREATE TABLE staff_roster (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift_start time NOT NULL,
  shift_end   time NOT NULL,
  shift_type  text NOT NULL DEFAULT 'day' CHECK (shift_type IN ('day','night','evening','on_call','custom')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_roster_user_date UNIQUE (user_id, shift_date, shift_start)
);
CREATE INDEX idx_staff_roster_tenant ON staff_roster (tenant_id, shift_date);
CREATE INDEX idx_staff_roster_user   ON staff_roster (user_id, shift_date);

CREATE TABLE attendance (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date  date NOT NULL DEFAULT CURRENT_DATE,
  check_in   timestamptz,
  check_out  timestamptz,
  status     attendance_status NOT NULL DEFAULT 'present',
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_user_date UNIQUE (user_id, work_date)
);
CREATE INDEX idx_attendance_tenant ON attendance (tenant_id, work_date);

CREATE TABLE staff_leave (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type   text NOT NULL DEFAULT 'annual' CHECK (leave_type IN ('annual','sick','study','unpaid','maternity')),
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  days         integer GENERATED ALWAYS AS ((end_date - start_date) + 1) STORED,
  reason       text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by  uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_leave_user ON staff_leave (user_id, start_date);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS / SMS / EMAIL
-- ---------------------------------------------------------------------------
CREATE TABLE notification_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel     text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email','push','in_app','whatsapp')),
  event       text NOT NULL,          -- appointment_reminder, payment_receipt, lab_result, ...
  subject     text,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_template UNIQUE (tenant_id, channel, event)
);
CREATE INDEX idx_notification_templates_tenant ON notification_templates (tenant_id);

CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,  -- NULL for broadcast
  patient_id    uuid REFERENCES patients(id) ON DELETE CASCADE,
  channel       text NOT NULL,
  event         text,
  title         text,
  message       text NOT NULL,
  reference_type text,
  reference_id  uuid,
  is_read       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed')),
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user    ON notifications (user_id, is_read);
CREATE INDEX idx_notifications_tenant  ON notifications (tenant_id, created_at);

-- ---------------------------------------------------------------------------
-- PLATFORM SUBSCRIPTIONS (SaaS billing)
-- ---------------------------------------------------------------------------
CREATE TABLE subscription_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  amount        numeric(12,2) NOT NULL,
  currency      text NOT NULL DEFAULT 'NGN',
  status        payment_status NOT NULL DEFAULT 'pending',
  provider      text NOT NULL DEFAULT 'paystack',
  provider_ref  text,
  -- automated via edge function + webhook
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sub_invoice UNIQUE (tenant_id, period_start)
);
CREATE INDEX idx_subscription_invoices_tenant ON subscription_invoices (tenant_id, status);

-- ---------------------------------------------------------------------------
-- AUDIT (append-only, RLS-read-only)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action     audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id  uuid,
  metadata   jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant  ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_action  ON audit_logs (tenant_id, action, created_at DESC);
CREATE INDEX idx_audit_entity  ON audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- BED, ward status maintenance is derived. Add a view for cleanliness
-- ---------------------------------------------------------------------------
COMMENT ON TABLE tenants IS 'Each hospital = one tenant. skycares.skycare-hsv.com subdomain routing.';