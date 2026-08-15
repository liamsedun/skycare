-- ============================================================================
-- 0070 — RE-POINT COMPLIANCE/PROCUREMENT USER FKs AT public.users
--  The register/audit/alert/supplier-payment tables FK'd user columns to
--  auth.users, but every API embeds `users(full_name, ...)` against the
--  public.users mirror. PostgREST then cannot resolve any relationship
--  ("Could not find a relationship between X and 'users' in the schema cache")
--  and the whole select 400s => Controlled register, Audit trail and
--  supplier-payments lists were permanently empty/broken.
--  Fix: drop the auth.users FKs and re-add them against public.users(id)
--  (public.users.id mirrors auth.users.id; app FK convention uses public.users).
-- ============================================================================

BEGIN;

ALTER TABLE public.controlled_drug_register
  DROP CONSTRAINT IF EXISTS controlled_drug_register_pharmacist_id_fkey,
  ADD CONSTRAINT controlled_drug_register_pharmacist_id_fkey
    FOREIGN KEY (pharmacist_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.dispensing_audit_logs
  DROP CONSTRAINT IF EXISTS dispensing_audit_logs_user_id_fkey,
  ADD CONSTRAINT dispensing_audit_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.pharmacy_compliance_alerts
  DROP CONSTRAINT IF EXISTS pharmacy_compliance_alerts_resolved_by_fkey,
  ADD CONSTRAINT pharmacy_compliance_alerts_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_payments
  DROP CONSTRAINT IF EXISTS supplier_payments_created_by_fkey,
  ADD CONSTRAINT supplier_payments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

COMMIT;