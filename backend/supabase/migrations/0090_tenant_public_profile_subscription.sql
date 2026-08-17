-- 0090_tenant_public_profile_subscription.sql
-- PHASE 2: expose subscription_status to the public website view so tenant
-- layouts can gate/replace the site when a subscription is suspended/cancelled.
-- No other columns are added; `settings` remains invisible to anon.
DROP VIEW IF EXISTS tenant_public_profile;
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
  subscription_status,
  -- legacy-compatible safe website jsonb (whitelisted keys only)
  jsonb_build_object(
    'tagline', website->>'tagline',
    'about', website->>'about'
  ) AS website,
  -- flattened safe keys for the CMS-driven engine
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

GRANT SELECT ON public.tenant_public_profile TO anon;