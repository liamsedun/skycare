-- SKYCARE — MIGRATION 0096: TEMPORARY POLICY DUMP (diagnostic, dropped in 0097)
CREATE OR REPLACE FUNCTION public.rls_policies_dump()
RETURNS TABLE (table_name text, policy_name text, cmd text, permissive text, roles text, using_expr text, check_expr text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT pol.tablename,
         pol.policyname,
         pol.cmd,
         pol.permissive,
         array_to_string(pol.roles, ',') AS roles,
         pol.qual,
         pol.with_check
  FROM pg_policies pol
  WHERE pol.schemaname = 'public'
  ORDER BY pol.tablename, pol.policyname;
$$;
REVOKE ALL ON FUNCTION public.rls_policies_dump() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_policies_dump() TO service_role;