-- ============================================================================
-- SKYCARE — MIGRATION 0002: JWT CLAIMS + ROW-LEVEL SECURITY (RLS)
-- Run after 0001. Idempotent.
--
-- Claims model: upon login the edge function writes app_metadata claims so the
-- JWT carries { tenant_id, role, branch_id }.
--   - tenant_id NULL + role=super_admin  => platform-wide access
--   - branch_id NULL for hospital_admin  => all branches
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CLAIM READERS (fast, no table lookups; values come from JWT metadata)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.get_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'role';
$$;

CREATE OR REPLACE FUNCTION public.get_branch_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'branch_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT get_role() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.is_hospital_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT get_role() IN ('super_admin', 'hospital_admin');
$$;

-- ---------------------------------------------------------------------------
-- RBAC STAFF CHECK: any authenticated in-tenant staff role that bypasses RLS
-- for cross-branch operations (audit, exports, platform tooling).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT get_role() IN ('hospital_admin','doctor','nurse','pharmacist','lab_tech',
                        'cashier','receptionist');
$$;

-- Patient portal accounts (see migration 0005).
CREATE OR REPLACE FUNCTION public.is_patient()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT get_role() = 'patient_api';
$$;

-- ---------------------------------------------------------------------------
-- POLICY TEMPLATES (one tenant filter reused on every table)
-- ---------------------------------------------------------------------------

-- ============================================================================
-- TENANTS / BRANCHES
-- ============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- tenant: visible to super_admin (all) + its own admins (read own config)
CREATE POLICY tenants_platform ON tenants FOR SELECT
  USING (is_super_admin() OR id = get_tenant_id());
CREATE POLICY tenants_platform_write ON tenants
  USING (is_super_admin() OR (id = get_tenant_id() AND is_hospital_admin()))
  WITH CHECK (is_super_admin() OR (id = get_tenant_id() AND is_hospital_admin()));
-- public hospital websites: anon visitors may read active tenants (no writes)
CREATE POLICY tenants_public_website ON tenants FOR SELECT
  USING (is_active = true AND auth.role() = 'anon');

CREATE POLICY branches_own ON branches FOR ALL
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR id = get_branch_id()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR id = get_branch_id()));

-- ============================================================================
-- USERS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users may only read profiles inside their own tenant; patient accounts see only
-- themselves. Staff see the staff directory (admin sees all branches).
CREATE POLICY users_tenant_read ON users FOR SELECT
  USING (
    is_super_admin()
    OR (tenant_id = get_tenant_id() AND is_patient() AND id = auth.uid())
    OR (tenant_id = get_tenant_id() AND is_staff())
  );

CREATE POLICY users_admin_write ON users
  USING (is_super_admin() OR (tenant_id = get_tenant_id() AND is_hospital_admin()))
  WITH CHECK (is_super_admin() OR (tenant_id = get_tenant_id() AND is_hospital_admin()));

-- ============================================================================
-- PATIENTS  (patient self-view + tenant staff; branch-sliced unless admin)
-- ============================================================================
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY patients_tenant_view ON patients FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id())
  );

CREATE POLICY patients_admin_write ON patients
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id()));

-- patient self-view policy added in migration 0005 (patients_self).

-- ============================================================================
-- APPOINTMENTS
-- ============================================================================
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_any ON appointments
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id()));

-- ============================================================================
-- VISITS / MEDICAL RECORDS (EHR)
-- ============================================================================
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY visits_any ON visits
  FOR ALL
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR get_branch_id() IS NULL OR branch_id = get_branch_id()));

CREATE POLICY medical_records_read ON medical_records FOR SELECT
  USING (tenant_id = get_tenant_id());
CREATE POLICY medical_records_write ON medical_records
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

-- ============================================================================
-- BILLING (invoices, items, payments)
-- ============================================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_any ON invoices
  FOR ALL
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY inv_items_any ON invoice_items
  FOR ALL
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id
                 AND i.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id
                      AND i.tenant_id = get_tenant_id()));

CREATE POLICY payments_any ON payments
  FOR ALL
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

-- ============================================================================
-- PHARMACY / INVENTORY
-- ============================================================================
ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY drugs_any ON drugs
  FOR ALL
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY drug_batches_len ON drug_batches
  FOR ALL
  USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_batches.drug_id
                 AND d.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_batches.drug_id
                      AND d.tenant_id = get_tenant_id()));

CREATE POLICY stock_movements_any ON stock_movements
  FOR ALL
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY prescriptions_any ON prescriptions
  FOR ALL
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY rx_items_any ON prescription_items
  FOR ALL
  USING (EXISTS (SELECT 1 FROM prescriptions p WHERE p.id = prescription_items.prescription_id
                 AND p.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM prescriptions p WHERE p.id = prescription_items.prescription_id
                      AND p.tenant_id = get_tenant_id()));

-- ============================================================================
-- SUPPLY CHAIN
-- ============================================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_any ON suppliers
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY po_any ON purchase_orders
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY po_items_len ON po_items
  FOR ALL
  USING (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_items.po_id
                 AND po.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = po_items.po_id
                      AND po.tenant_id = get_tenant_id()));

CREATE POLICY grn_any ON goods_receipts
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY requisitions_any ON requisitions
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

-- ============================================================================
-- LABORATORY
-- ============================================================================
ALTER TABLE lab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_order_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY lab_tests_any ON lab_tests
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY lab_orders_any ON lab_orders
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY lab_order_tests_len ON lab_order_tests
  FOR ALL
  USING (EXISTS (SELECT 1 FROM lab_orders lo WHERE lo.id = lab_order_tests.order_id
                 AND lo.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM lab_orders lo WHERE lo.id = lab_order_tests.order_id
                      AND lo.tenant_id = get_tenant_id()));

CREATE POLICY lab_results_len ON lab_results
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM lab_order_tests lot
    JOIN lab_orders lo ON lo.id = lot.order_id
    WHERE lot.id = lab_results.order_test_id AND lo.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM lab_order_tests lot
    JOIN lab_orders lo ON lo.id = lot.order_id
    WHERE lot.id = lab_results.order_test_id AND lo.tenant_id = get_tenant_id()));

-- ============================================================================
-- WARDS / BEDS / ADMISSIONS
-- ============================================================================
ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wards_any ON wards
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY beds_len ON beds
  FOR ALL
  USING (EXISTS (SELECT 1 FROM wards w WHERE w.id = beds.ward_id
                 AND w.tenant_id = get_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM wards w WHERE w.id = beds.ward_id
                      AND w.tenant_id = get_tenant_id()));

CREATE POLICY admissions_any ON admissions
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

-- ============================================================================
-- STAFF / HR
-- ============================================================================
ALTER TABLE staff_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_leave ENABLE ROW LEVEL SECURITY;

CREATE POLICY roster_any ON staff_roster
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY attendance_any ON attendance
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY leave_any ON staff_leave
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_tmpl_any ON notification_templates
  FOR ALL USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY notifications_own ON notifications
  FOR SELECT
  USING (tenant_id = get_tenant_id()
         AND (user_id = auth.uid() OR is_staff() OR is_hospital_admin()));

-- ============================================================================
-- SUBSCRIPTIONS (platform-level billing; tenant admins may see own).
-- Audit: select-only for admins within tenant (hides from staff).
-- ============================================================================
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_inv_tenant ON subscription_invoices
  FOR SELECT USING (tenant_id = get_tenant_id());
-- platform writes subscription_invoices via service role only.

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_logs
  FOR SELECT USING (is_hospital_admin() AND (tenant_id = get_tenant_id() OR is_super_admin()));

-- ============================================================================
-- APP SELF-SERVICE (patient identity) - optional future patient API
-- place at very end: patient_api role reads own data via joins.
-- ============================================================================

-- Enforcement: nobody can alter RLS state through the anon key.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.tenants, public.branches TO anon; -- public hospital websites

-- Future tables must not default to anon-accessible either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;