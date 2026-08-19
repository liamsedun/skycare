-- ============================================================================
-- SKYCARE — MIGRATION 0099: TEMPORARY FUNCTION-EXECUTION AUDIT
--
-- Temporary diagnostic (like 0095/0096): lists every SECURITY DEFINER function
-- in the public schema plus which roles hold EXECUTE (anon / authenticated /
-- service_role / PUBLIC), so we can close every cross-tenant-capable RPC.
-- Dropped by the follow-up hardening migration (0100).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_exec_audit()
RETURNS TABLE (
  fn_name       text,
  is_definer    boolean,
  anon_exec     boolean,
  auth_exec     boolean,
  svc_exec      boolean,
  pub_exec      boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT p.oid, n.nspname, p.proname,
           p.prosecdef,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
    ORDER BY p.proname
  LOOP
    fn_name   := rec.proname || '(' || rec.args || ')';
    is_definer := rec.prosecdef;
    anon_exec := has_function_privilege('anon', rec.oid, 'EXECUTE');
    auth_exec := has_function_privilege('authenticated', rec.oid, 'EXECUTE');
    svc_exec  := has_function_privilege('service_role', rec.oid, 'EXECUTE');
    pub_exec  := has_function_privilege('public', rec.oid, 'EXECUTE');
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.fn_exec_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_exec_audit() TO service_role;