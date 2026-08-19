-- 0094_website_about_images.sql
-- Add two dedicated About-page image slots to the public website profile:
--
-- * `about_story_image` - photo shown in the About page's story section
--   (doctor attending a patient). Falls back to `hero_image` (home hero) so
--   existing sites keep their current look until they set it.
-- * `facility_image`    - photo shown in the About page's "Hospital Building"
--   section (reception / waiting hall).
--
-- Both live in `tenants.website` JSONB like the other site-facing keys, are
-- settable through the tenant-settings API whitelist, and are exposed read-only
-- via `tenant_public_profile` (anon can already read that view).

-- ---------------------------------------------------------------------------
-- Public view: add the two flattened image keys.
-- ---------------------------------------------------------------------------
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
  website_enabled,
  -- legacy-compatible safe website jsonb (whitelisted keys only)
  jsonb_build_object(
    'tagline', website->>'tagline',
    'about', website->>'about'
  ) AS website,
  -- flattened safe keys for the CMS-driven engine
  website->>'tagline' AS tagline,
  website->>'about' AS about,
  website->>'hero_image' AS hero_image,
  website->>'about_story_image' AS about_story_image,
  website->>'facility_image' AS facility_image,
  website->>'emergency_phone' AS emergency_phone,
  website->'opening_hours' AS opening_hours,
  website->'social' AS social,
  website->>'seo_title' AS seo_title,
  website->>'seo_description' AS seo_description,
  website->>'favicon_url' AS favicon_url
FROM tenants
WHERE is_active = true;

GRANT SELECT ON public.tenant_public_profile TO anon;