-- ============================================================================
-- SKYCARE — MIGRATION 0095: TEMPORARY RLS AUDIT FUNCTION
--
-- Diagnostic only. Reports, for every table in the public schema, whether RLS
-- is enabled, whether FORCE ROW LEVEL SECURITY is on, how many policies exist,
-- which roles hold executable SELECT privileges, and whether the table has a
-- tenant_id column (signal for tenant-scoped policies).
-- Dropped by the hardening migration that follows this audit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rls_audit()
RETURNS TABLE (
  table_name      text,
  rls_enabled     boolean,
  rls_forced      boolean,
  policy_count    integer,
  anon_select     boolean,
  auth_select     boolean,
  svc_select      boolean,
  has_tenant_id   boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname,
           c.relrowsecurity       AS rls_on,
           c.relforcerowsecurity  AS forced,
           c.oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname NOT LIKE 'pg_%'
    ORDER BY c.relname
  LOOP
    SELECT count(*) INTO policy_count
      FROM pg_policies pol
      WHERE pol.schemaname = 'public' AND pol.tablename = rec.relname;

    table_name      := rec.relname;
    rls_enabled     := rec.rls_on;
    rls_forced      := rec.forced;
    anon_select     := has_table_privilege('anon', rec.oid, 'SELECT');
    auth_select     := has_table_privilege('authenticated', rec.oid, 'SELECT');
    svc_select      := has_table_privilege('service_role', rec.oid, 'SELECT');
    SELECT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = rec.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    ) INTO has_tenant_id;
    RETURN NEXT;
  END LOOP;
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.rls_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_audit() TO service_role;