-- 0007_fix_claim_helpers.sql
-- Claims are nested under app_metadata in Supabase JWTs. The original helpers
-- read top-level keys and returned NULL, which silently broke every RLS
-- tenant filter. Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.get_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

CREATE OR REPLACE FUNCTION public.get_branch_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() -> 'app_metadata' ->> 'branch_id', '')::uuid;
$$;
