-- 0092_website_seed_revoke_authenticated.sql
-- Security hardening: seed_website_defaults is SECURITY DEFINER and writes to
-- other tenants' rows. It must ONLY be callable by the service role (the API
-- route uses ctx.svc). Revoke the authenticated grant so a logged-in patient
-- cannot force-provision an arbitrary tenant's website.
REVOKE EXECUTE ON FUNCTION public.seed_website_defaults(uuid) FROM authenticated;