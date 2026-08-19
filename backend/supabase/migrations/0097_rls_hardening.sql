-- ============================================================================
-- SKYCARE — MIGRATION 0097: RLS HARDENING
--
-- Closes every path by which an unauthenticated or any-tenant-authenticated
-- caller could read/write data that belongs to other tenants (or disabled-RLS
-- tables) through the public Supabase REST surface.
--
--   1. Tenant-scope the 7 role-only staff-read policies (0041/0061/0062)
--      that previously matched ONLY on `auth.jwt()->'role'` — a doctor from
--      tenant B could read tenant A's invoices/ledgers/claims.
--   2. Enable RLS on the 3 pharmacy reference tables (0031) — pharmacy_diag_rules
--      / pharmacy_interactions / pharmacy_margin_benchmarks were RLS-disabled
--      with authenticated SELECT, so ANY signed-in user could read the PLATFORM
--      global seed rows + every tenant's overrides.
--   3. Lock the t_bind2/3/4 dev-scratch tables (RLS enabled, zero policies →
--      denied for every non-bypass role; service_role bypasses RLS and is the
--      only reader left). They are unreferenced by the app.
--   4. Revoke the anon SELECT grant on public.branches (0002/0008) — the public
--      websites ([slug] landing + book pages) read branches via the SERVICE
--      client, so anon no longer needs table access.
--   5. Revoke EXECUTE on the SECURITY DEFINER RPCs that bypass RLS and take a
--      caller-supplied tenant UUID — prescription_verify_snapshot (granted to
--      ANON in 0029, leaks patient+doctor names for any prescription UUID) and
--      the pharmacy AI + prescription-queue functions (granted to authenticated,
--      cross-tenant read capable). The app only ever calls these via the service
--      client, so service_role inherits default EXECUTE; explicit service grants
--      are added for clarity and future-proofing.
--
-- The diagnostic functions from 0095/0096 (rls_audit, rls_policies_dump) are
-- DROPPED by the FOLLOW-UP migration 0098, AFTER this one has been pushed and
-- the audit re-run confirms the hardened state.
--
-- Deploy: `npx supabase db push --linked --yes`. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TENANT-SCOPE THE 7 ROLE-ONLY STAFF-READ POLICIES
-- ---------------------------------------------------------------------------
-- Pattern mirrors the already-hardened pharmacy_drugs_staff_read /
-- pharmacy_categories_staff_read: tenant must match the JWT claim (platform
-- super_admin passes via is_super_admin() regardless of tenant), and the
-- existing per-table role list is preserved verbatim (hospital_bank_ledger has
-- a wider list that includes accountant/receptionist/lab_tech/hr_officer).

-- 1a. pharmacy_invoices (tenant_id column present)
DROP POLICY IF EXISTS pharmacy_billing_staff_read ON pharmacy_invoices;
CREATE POLICY pharmacy_billing_staff_read ON pharmacy_invoices
  FOR SELECT TO authenticated
  USING (
    ((tenant_id = get_tenant_id()) AND
     ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
       'hospital_admin'::text, 'pharmacist'::text, 'cashier'::text,
       'doctor'::text, 'nurse'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- 1b. pharmacy_payments (tenant_id column present)
DROP POLICY IF EXISTS pharmacy_billing_staff_read ON pharmacy_payments;
CREATE POLICY pharmacy_billing_staff_read ON pharmacy_payments
  FOR SELECT TO authenticated
  USING (
    ((tenant_id = get_tenant_id()) AND
     ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
       'hospital_admin'::text, 'pharmacist'::text, 'cashier'::text,
       'doctor'::text, 'nurse'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- 1c. insurance_coverage (tenant_id column present)
DROP POLICY IF EXISTS pharmacy_billing_staff_read ON insurance_coverage;
CREATE POLICY pharmacy_billing_staff_read ON insurance_coverage
  FOR SELECT TO authenticated
  USING (
    ((tenant_id = get_tenant_id()) AND
     ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
       'hospital_admin'::text, 'pharmacist'::text, 'cashier'::text,
       'doctor'::text, 'nurse'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- 1d. insurance_claims (tenant_id column present)
DROP POLICY IF EXISTS pharmacy_billing_staff_read ON insurance_claims;
CREATE POLICY pharmacy_billing_staff_read ON insurance_claims
  FOR SELECT TO authenticated
  USING (
    ((tenant_id = get_tenant_id()) AND
     ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
       'hospital_admin'::text, 'pharmacist'::text, 'cashier'::text,
       'doctor'::text, 'nurse'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- 1e. pharmacy_invoice_items — NO tenant_id column; scope via its parent
--     pharmacy_invoices (EXISTS-join, same pattern as beds→wards).
DROP POLICY IF EXISTS pharmacy_billing_staff_read ON pharmacy_invoice_items;
CREATE POLICY pharmacy_billing_staff_read ON pharmacy_invoice_items
  FOR SELECT TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM pharmacy_invoices pi
      WHERE pi.id = pharmacy_invoice_items.invoice_id
        AND pi.tenant_id = get_tenant_id()
    ) AND ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
      'hospital_admin'::text, 'pharmacist'::text, 'cashier'::text,
      'doctor'::text, 'nurse'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- 1f. pharmacy_bank_ledger (tenant_id column present)
DROP POLICY IF EXISTS pharmacy_bank_ledger_staff_read ON pharmacy_bank_ledger;
CREATE POLICY pharmacy_bank_ledger_staff_read ON pharmacy_bank_ledger
  FOR SELECT TO authenticated
  USING (
    ((tenant_id = get_tenant_id()) AND
     ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
       'hospital_admin'::text, 'pharmacist'::text, 'cashier'::text,
       'doctor'::text, 'nurse'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- 1g. hospital_bank_ledger — keeps its wider role list unchanged
DROP POLICY IF EXISTS hospital_bank_ledger_staff_read ON hospital_bank_ledger;
CREATE POLICY hospital_bank_ledger_staff_read ON hospital_bank_ledger
  FOR SELECT TO authenticated
  USING (
    ((tenant_id = get_tenant_id()) AND
     ((auth.jwt() ->> 'role'::text) = ANY (ARRAY[
       'hospital_admin'::text, 'cashier'::text, 'accountant'::text,
       'pharmacist'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text,
       'lab_tech'::text, 'hr_officer'::text, 'super_admin'::text])))
    OR is_super_admin()
  );

-- ---------------------------------------------------------------------------
-- 2. ENABLE RLS ON THE 3 PHARMACY REFERENCE TABLES + STAFF-READ POLICY
--    (mirrors pharmacy_categories_staff_read: platform rows have tenant_id NULL,
--     tenant rows must match the JWT; staff-only, super_admin everywhere.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pharmacy_diag_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_reference_staff_read ON public.pharmacy_diag_rules;
CREATE POLICY pharmacy_reference_staff_read ON public.pharmacy_diag_rules
  FOR SELECT TO authenticated
  USING (
    (is_staff() AND ((tenant_id IS NULL) OR (tenant_id = get_tenant_id())))
    OR is_super_admin()
  );

ALTER TABLE public.pharmacy_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_reference_staff_read ON public.pharmacy_interactions;
CREATE POLICY pharmacy_reference_staff_read ON public.pharmacy_interactions
  FOR SELECT TO authenticated
  USING (
    (is_staff() AND ((tenant_id IS NULL) OR (tenant_id = get_tenant_id())))
    OR is_super_admin()
  );

ALTER TABLE public.pharmacy_margin_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pharmacy_reference_staff_read ON public.pharmacy_margin_benchmarks;
CREATE POLICY pharmacy_reference_staff_read ON public.pharmacy_margin_benchmarks
  FOR SELECT TO authenticated
  USING (
    (is_staff() AND ((tenant_id IS NULL) OR (tenant_id = get_tenant_id())))
    OR is_super_admin()
  );

-- ---------------------------------------------------------------------------
-- 3. LOCK THE t_bind DEV-SCRATCH TABLES — RLS on with ZERO policies denies
--    every non-bypass role; service_role (BYPASSRLS) remains the only reader.
--    Guarded for existence: these were created ad-hoc in the SQL editor and
--    are absent from a fresh deploy, so the ALTERs must no-op gracefully.
-- ---------------------------------------------------------------------------
DO $$
DECLARE _t text;
BEGIN
  FOREACH _t IN ARRAY ARRAY['t_bind2', 't_bind3', 't_bind4']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = _t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', _t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. REVOKE ANON SELECT ON public.branches (public sites read via service
--    client only)
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.branches FROM anon;

-- ---------------------------------------------------------------------------
-- 5. REVOKE EXECUTE ON RLS-BYPASSING (SECURITY DEFINER) RPCs FROM
--    anon/authenticated + EXPLICIT service_role GRANTs
--    (the app invokes ALL of these via the service client only — svc.rpc() or
--     ctx.svc.rpc() — verified across the full frontend surface)
-- ---------------------------------------------------------------------------

-- 5a. prescription_verify_snapshot — was granted EXECUTE to ANON (0029);
--     leaks patient_name/doctor_name/drugs for ANY prescription UUID.
--     The QR verify page + /api/verify routes both call via createServiceClient().
REVOKE EXECUTE ON FUNCTION public.prescription_verify_snapshot(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.prescription_verify_snapshot(uuid) TO service_role;

-- 5b. Pharmacy AI engine (0031) — all SECURITY DEFINER + caller-supplied
--     p_tenant_id; only ever executed via ctx.svc.rpc().
REVOKE EXECUTE ON FUNCTION public.pharmacy_recommend_drugs(uuid, text, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_recommend_drugs(uuid, text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pharmacy_alternatives(uuid, uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_alternatives(uuid, uuid, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pharmacy_interaction_check(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_interaction_check(uuid, uuid[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pharmacy_suggest_pricing(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_suggest_pricing(uuid, uuid) TO service_role;

-- 5c. pharmacy_prescription_queue (0025) — SECURITY DEFINER, caller-supplied
--     p_tenant; must be svc-only.
REVOKE EXECUTE ON FUNCTION public.pharmacy_prescription_queue(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_prescription_queue(uuid, text) TO service_role;