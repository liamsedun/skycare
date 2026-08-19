-- ============================================================================
-- SKYCARE — MIGRATION 0098: DROP TEMPORARY RLS DIAGNOSTICS (0095/0096)
--
-- rls_audit() and rls_policies_dump() were temporary functions used to audit
-- RLS coverage. The hardening migration (0097) has been pushed and the audit
-- re-run confirmed 0 RLS-disabled tables and tenant-scoped policies on all 7
-- former role-only staff-read policy sites. These diagnostics are no longer
-- needed and should not linger in the public schema.
--
-- Deploy: `npx supabase db push --linked --yes`. Idempotent.
-- ============================================================================

DROP FUNCTION IF EXISTS public.rls_audit();
DROP FUNCTION IF EXISTS public.rls_policies_dump();