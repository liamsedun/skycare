-- 0088_tenant_public_profile.sql
-- PHASE 0 security hardening:
--   1) Anonymous PostgREST readers previously saw EVERY column of `tenants`
--      (incl. `settings` JSONB with Paystack secret keys + `website`/plan data)
--      via the `tenants_public_website` anon policy + `GRANT SELECT ... TO anon`.
--   2) `GET /api/auth/me` also leaked `settings` to any logged-in user (fixed app-side).
--
-- Now anonymous callers may read ONLY a curated public profile view:
--   tenant_public_profile — name/brand/contact/website content (tagline, about,
--   hero, opening hours, social, SEO, favicon). `settings` is never exposed.

-- The public profile view: safe projection of tenants (active only).
-- `website` jsonb is rebuilt from whitelisted keys so legacy readers
-- (`website?.tagline`, `website?.about` in [slug]/page.tsx) keep working.
CREATE OR REPLACE VIEW tenant_public_profile AS
SELECT
  id,
  name,
  slug,
  domain,
  logo_url,
  brand_color,
  phone,
  email,
  address,
  city,
  state,
  country,
  website_url,
  is_active,
  -- legacy-compatible safe website jsonb (whitelisted keys only)
  jsonb_build_object(
    'tagline', website->>'tagline',
    'about', website->>'about'
  ) AS website,
  -- flattened safe keys for the CMS-driven engine (Phase 2+)
  website->>'tagline' AS tagline,
  website->>'about' AS about,
  website->>'hero_image' AS hero_image,
  website->>'emergency_phone' AS emergency_phone,
  website->'opening_hours' AS opening_hours,
  website->'social' AS social,
  website->>'seo_title' AS seo_title,
  website->>'seo_description' AS seo_description,
  website->>'favicon_url' AS favicon_url
FROM tenants
WHERE is_active = true;

-- Drop the old anon SELECT policy on tenants itself.
DROP POLICY IF EXISTS tenants_public_website ON public.tenants;

-- No anon SELECT on the base table (RLS policy is gone; also revoke any grant).
REVOKE SELECT ON public.tenants FROM anon;

-- Anonymous visitors may SELECT the public profile view only.
GRANT SELECT ON public.tenant_public_profile TO anon;

-- Authenticated users keep their existing tenant RLS reads on `tenants`.