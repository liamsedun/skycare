-- ============================================================================
-- SKYCARE — MIGRATION 0100: HARDEN FUNCTION-EXECUTION SURFACE (PUBLIC/anon)
--
-- PostgreSQL grants EXECUTE on newly-created functions to PUBLIC by default.
-- Several SECURITY DEFINER functions were created WITHOUT `REVOKE ALL ... FROM
-- PUBLIC`, so the PUBLIC anon key (and any signed-in authenticated user) can
-- still invoke cross-tenant-capable RPCs even after 0097 revoked the explicit
-- `authenticated` grants. Ground-truth probe (029p): anon got 200 on
-- pharmacy_recommend_drugs / pharmacy_prescription_queue and 204 (writes) on
-- seed_website_defaults / seed_lab_catalog / analytics_bump_daily /
-- notify_prescription_event.
--
-- This migration closes the class:
--   A. Caller-scoped RPCs — REVOKE ALL FROM PUBLIC, anon, authenticated;
--      explicit GRANT EXECUTE TO service_role (the app calls these via ctx.svc
--      / svc only — verified across the frontend).
--   B. Trigger/notify functions — REVOKE ALL FROM PUBLIC, anon; KEEP
--      authenticated (row-trigger paths must keep executing under RLS writes;
--      closing the anon REST surface is the goal).
--   C. RLS helper functions — REVOKE ALL FROM PUBLIC, anon; KEEP authenticated
--      (policies call them as the querying role).
--   D. Defense-in-depth: ALTER DEFAULT PRIVILEGES so future public-schema
--      functions DON'T default to PUBLIC EXECUTE.
--
-- Deploy: `npx supabase db push --linked --yes`. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. CALLCER-SCOPED RPCs — svc/service_role only
-- ---------------------------------------------------------------------------

-- my_ai engine (0031) — tenant/diagnosis/drug supplied by the caller
REVOKE ALL ON FUNCTION public.pharmacy_recommend_drugs(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_recommend_drugs(uuid, text, int) TO service_role;

REVOKE ALL ON FUNCTION public.pharmacy_alternatives(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_alternatives(uuid, uuid, int) TO service_role;

REVOKE ALL ON FUNCTION public.pharmacy_interaction_check(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_interaction_check(uuid, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.pharmacy_suggest_pricing(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_suggest_pricing(uuid, uuid) TO service_role;

-- prescription workflow (0025/0029)
REVOKE ALL ON FUNCTION public.pharmacy_prescription_queue(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_prescription_queue(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.prescription_verify_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prescription_verify_snapshot(uuid) TO service_role;

-- privacy/identity (signed-out edge + staff flows; 0020/0022/0029)
REVOKE ALL ON FUNCTION public.seed_lab_catalog(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_lab_catalog(uuid) TO service_role;

-- website provisioning (0091/0092) — had only revoked authenticated; PUBLIC/anon stayed open
REVOKE ALL ON FUNCTION public.seed_website_defaults(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_website_defaults(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- B. TRIGGER / NOTIFY FUNCTIONS — keep authenticated (RLS-write triggers fire
--    log_audit/notify_* under the authenticated role; revoking EXECUTE would
--    break every RLS-scoped write), close PUBLIC + anon. (The residual
--    authenticated-role forge surface on notify_prescription_event is noted in
--    AGENTS.md and tracked as a follow-up; the demonstrated exploit — the
--    unauthenticated anon/public path — is closed by this block.)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.log_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.lab_request_created_notify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_request_created_notify() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.notify_prescription_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_prescription_event(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.trigger_seed_lab_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trigger_seed_lab_catalog() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.analytics_bump_daily(uuid, uuid, date, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_bump_daily(uuid, uuid, date, text, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C. RLS HELPER FUNCTIONS — keep authenticated (policy evaluation), close
--    PUBLIC + anon (anon must not be able to probe family membership)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.family_patient_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_patient_ids() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_family_primary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_family_primary(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- D. DEFAULT PRIVILEGES — no more accidental PUBLIC EXECUTE on future funcs
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;