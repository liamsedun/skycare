-- ============================================================================
-- SKYCARE — MIGRATION 0101: DROP TEMPORARY FUNCTION-EXECUTION AUDIT (0099)
--
-- fn_exec_audit() was a temporary diagnostic used to map the SECURITY DEFINER
-- execution surface. The hardening (0097 + 0100) is pushed and ground-truth
-- verified (anon→401 on every cross-tenant RPC; svc path intact; public site
-- unaffected). The diagnostic function can now be dropped.
--
-- Deploy: `npx supabase db push --linked --yes`. Idempotent.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_exec_audit();