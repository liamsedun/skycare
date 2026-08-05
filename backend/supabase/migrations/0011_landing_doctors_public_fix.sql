-- ============================================================================
-- SKYCARE — MIGRATION 0011: CLOSE LANDING DOCTORS ANON LEAK
-- The tenant public site (/[slug]) renders doctors server-side via the
-- service client with a tenant_id filter, so anon reads are never needed.
-- The 0008 anon policy allowed ANY anonymous visitor to list every tenant's
-- active doctors (no tenant filter) — drop it and revoke the anon grant.
-- Idempotent.
-- ============================================================================

DROP POLICY IF EXISTS landing_doctors_public ON landing_doctors;
REVOKE SELECT ON public.landing_doctors FROM anon;
