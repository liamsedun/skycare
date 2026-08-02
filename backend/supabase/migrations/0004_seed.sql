-- ============================================================================
-- SKYCARE — MIGRATION 0004: SEED DATA
-- Demo tenant (demo.skycare.app), a super_admin platform user, branches,
-- when possible staff + patients. Deterministic UUIDs so it is re-runnable
-- with INSERT ... ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------
-- Demo tenant (hospital)
-- ---------------------------------------------------------------
INSERT INTO tenants (id, name, slug, domain, email, phone, address, city, state,
                     country, brand_color, plan, currency, timezone, is_active,
                     trial_ends_at, settings, website)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'demoCare Hospital',
  'democare',
  NULL,               -- custom domain unset
  'demo@skycare.app',
  '+234 801 234 5678',
  '12 Adeola Odeku Street',
  'Victoria Island',
  'Lagos',
  'Nigeria',
  '#0ea5e9',
  'enterprise',
  'NGN',
  'Africa/Lagos',
  true,
  now() + interval '30 days',
  '{"sms_provider":"termii","lab_auto_fill":true}'::jsonb,
  '{"about":"demoCare is a demo hospital","tagline":"Leading cardiac & general care","services_dummy":true}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- Branches
-- -----------------------------------------------------------
INSERT INTO branches (id, tenant_id, name, code, city, is_main) VALUES
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Main Hospital','VIL','Victoria Island',true),
  ('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Ikoyi Clinic','IKOYI','Ikoyi',false)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- Users (staff). Password hash value is a placeholder; real fresh bcrypt hashes
-- are write-once via auth/register edge function (never seed real creds).
-- -----------------------------------------------------------
INSERT INTO users (id, tenant_id, branch_id, email, password_hash, full_name, role, phone)
VALUES
  ('12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'admin@democare.skycare.app','placeholder-hash','Amina Bakare','hospital_admin','+2348010000001'),
  ('12000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'dr.tunde@democare.skycare.app','placeholder-hash','Dr. Tunde Adebayo','doctor','+2348010000002'),
  ('12000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'dr.grace@democare.skycare.app','placeholder-hash','Dr. Grace Okafor','doctor','+2348010000003'),
  ('12000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002',
   'nurse@ikoyi.democare.skycare.app','placeholder-hash','Nurse Chinwe Eze','nurse','+2348010000004'),
  ('12000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'pharm@democare.skycare.app','placeholder-hash','Pharm. Bello Musa','pharmacist','+2348010000005'),
  ('12000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'lab@democare.skycare.app','placeholder-hash','Lab Tech Sam Okenwa','lab_tech','+2348010000006'),
  ('12000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'billing@democare.skycare.app','placeholder-hash','Folake Billing','cashier','+2348010000007')
ON CONFLICT (id) DO NOTHING;

-- Platform super_admin (tenant NULL)
INSERT INTO users (id, tenant_id, branch_id, email, password_hash, full_name, role, is_active)
VALUES ('12000000-0000-0000-0000-000000000099', NULL, NULL,
        'platform@skycare.app','placeholder-hash','SkyCare Platform Admin','super_admin', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------
INSERT INTO patients (id, tenant_id, branch_id, primary_branch_id, patient_number,
  first_name, last_name, gender, date_of_birth, phone, email, city, state,
  blood_group, genotype, nhia_number, is_insured, status)
VALUES
  ('13000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'PT-0001','Chidi','Eze','male','1992-07-15','+2348020000001','chidi@example.com',
   'Victoria Island','Lagos','AB+','AA', NULL, true, 'active'),
  ('13000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002',
   'PT-0002','Amara','Obinna','female','1988-11-02','0802340000003','amara@example.com',
   'Ikoyi','Lagos','O-','AS','NHIA123456', true, 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- Wards and beds
-- ---------------------------------------------------------------
INSERT INTO wards (id, tenant_id, branch_id, name, ward_type) VALUES
  ('14000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','General Ward','general'),
  ('14000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','ICU','icu')
ON CONFLICT (id) DO NOTHING;

INSERT INTO beds (id, ward_id, bed_number) VALUES
  ('15000000-0000-0000-0000-000000000001','14000000-0000-0000-0000-000000000001','A-01'),
  ('15000000-0000-0000-0000-000000000002','14000000-0000-0000-0000-000000000001','A-02')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- Drugs / formulary
-- ---------------------------------------------------------------
INSERT INTO drugs (id, tenant_id, branch_id, name, generic_name, sku, category, unit,
  unit_price, reorder_level, requires_rx, nafdac_number)
VALUES
  ('16000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'Lisinopril 10mg','Lisinopril','LIS-10','antihl','tablet', 250.00, 50, true, 'NAFDAC-001'),
  ('16000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',
   'Paracetamol 500mg','Paracetamol','PAR-500','analgesic','tablet', 20.00, 200, false, 'NAFDAC-002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO drug_batches (id, drug_id, batch_number, expiry_date, quantity_on_hand, cost_price)
VALUES
  ('16100000-0000-0000-0000-000000000001','16000000-0000-0000-0000-000000000001','B-2025-001','2027-06-01', 300, 200.00),
  ('16100000-0000-0000-0000-000000000002','16000000-0000-0000-0000-000000000002','B-2025-002','2027-01-01', 1000, 10.00)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- Lab tests
-- ---------------------------------------------------------------
INSERT INTO lab_tests (id, tenant_id, name, category, price, reference_range)
VALUES
  ('17000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Malaria (RDT)','microbiology',1500.00,'Negative'),
  ('17000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Blood Panel','hematology',8000.00,'Various')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- Sample appointment + visit (completed, historical)
-- ---------------------------------------------------------------
INSERT INTO appointments (id, tenant_id, branch_id, patient_id, doctor_id, scheduled_date,
  start_time, end_time, status, reason)
VALUES
  ('18000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',
   '12000000-0000-0000-0000-000000000002', CURRENT_DATE + 1, '09:00', '09:30',
   'scheduled','Routine cardiac checkup')
ON CONFLICT (id) DO NOTHING;

INSERT INTO visits (id, tenant_id, branch_id, patient_id, doctor_id, appointment_id,
  visit_type, visit_date, chief_complaint, diagnosis)
VALUES ('19000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 '11000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',
 '12000000-0000-0000-0000-000000000002','18000000-0000-0000-0000-000000000001',
 'outpatient','2026-07-01','Mild hypertension','Essential hypertension (I10)')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------
-- Demo invoice + payment (fully paid)
-- -----------------------------------------------------------
INSERT INTO invoices (id, tenant_id, branch_id, patient_id, invoice_number, issue_date,
  subtotal, total_amount, paid_amount, status, insurance_claimable)
VALUES ('1a000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 '11000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',
 'INV-0001','2026-07-01', 45000.00, 45000.00, 45000.00, 'paid', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (id, tenant_id, invoice_id, patient_id, amount, payment_method,
  status, reference, gateway, paid_at)
VALUES ('1b000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 '1a000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',
 45000.00,'transfer','completed','-placeholder-check-ref-','offline','2026-07-01')
ON CONFLICT (id) DO NOTHING;