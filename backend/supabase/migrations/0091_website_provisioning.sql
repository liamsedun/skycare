-- 0091_website_provisioning.sql
-- PHASE 4: automatic tenant website provisioning + default content seeding.
--
-- * `tenants.website_enabled`     - public site on/off toggle (mirrors the
--   suspended/subscription gate in the [slug] layout).
-- * `tenants.website_provisioned` - internal flag: false = the admin has not
--   completed the onboarding wizard. New tenants (created after this migration)
--   start unprovisioned so first login redirects to /app/onboarding; existing
--   tenants are flagged provisioned (no forced wizard) and instead get a
--   "Provision default website" button in Settings.
-- * `public.seed_website_defaults(tenant_id)` - the SINGLE source of the
--   name-derived default website (tagline/about/emergency/opening hours + the
--   8 flagship services + 5 departments + an About page). Idempotent:
--   JSONB keys are only written when the site isn't provisioned yet, and
--   services/departments/pages use ON CONFLICT DO NOTHING. Called by
--   `POST /api/website/provision` (wizard Finish + Settings button), never by
--   a tenant-insert trigger so the first-run wizard is not skipped.
--
-- The public view gains `website_enabled` (site gate readable by anon);
-- `website_provisioned` stays admin-internal.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS website_enabled   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS website_provisioned boolean NOT NULL DEFAULT false;

-- Case-insensitive unique names so seeding is idempotent and the CMS admin
-- duplicate check stays race-free.
CREATE UNIQUE INDEX IF NOT EXISTS uq_website_services_tenant_name_ci
  ON website_services (tenant_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_website_departments_tenant_name_ci
  ON website_departments (tenant_id, lower(name));

-- ---------------------------------------------------------------------------
-- seed_website_defaults(p_tenant_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_website_defaults(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_phone text;
  v_email text;
BEGIN
  SELECT name, phone, email INTO v_name, v_phone, v_email
  FROM tenants WHERE id = p_tenant_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'tenant % not found', p_tenant_id;
  END IF;

  -- 1. Name-derived website JSONB defaults (only for a fresh, unprovisioned site).
  UPDATE tenants
  SET website = website || jsonb_build_object(
    'tagline', v_name || ' — Community healthcare, delivered with care',
    'about', v_name ||
      ' is a modern healthcare provider committed to accessible, high-quality care for our community. ' ||
      'From routine check-ups to specialist treatment, our team of experienced clinicians puts your health first ' ||
      '— with a 30-day free trial website, online appointment booking and a patient portal included.',
    'emergency_phone', COALESCE(v_phone, NULL),
    'opening_hours', jsonb_build_object(
      'mon_fri', '8:00am – 6:00pm',
      'saturday', '9:00am – 4:00pm',
      'sunday', 'Emergency only'
    ),
    'social', jsonb_build_object(
      'facebook', NULL,
      'instagram', NULL,
      'x', NULL,
      'whatsapp', NULL
    )
  )
  WHERE id = p_tenant_id
    AND website_provisioned = false;

  -- 2. The 8 flagship services (parity with lib/tenant-site DEFAULT_SERVICES).
  INSERT INTO website_services (tenant_id, name, description, icon, display_order, active)
  SELECT p_tenant_id, s.name, s.description, s.icon, s.display_order::integer, true
  FROM (VALUES
    ('General Consultation', 'Comprehensive consultations with experienced physicians who take the time to listen.', 'stethoscope', '1'),
    ('Cardiology',          'Heart health — diagnostics, treatment and follow-up for every patient.',                 'heart',       '2'),
    ('Laboratory & Diagnostics', 'Accurate laboratory and diagnostic services, delivered fast.',                   'flask',       '3'),
    ('Pharmacy',            'Quality medications, dispensed safely with clear guidance.',                            'pill',        '4'),
    ('Maternity & Pediatrics', 'Complete care for mothers and children, from prenatal to paediatrics.',              'baby',        '5'),
    ('Emergency Care',      '24/7 emergency response when every minute counts.',                                     'ambulance',   '6'),
    ('Surgery',             'Modern surgical care with patient safety at the centre.',                               'scissors',    '7'),
    ('Vaccination',         'Routine and travel vaccinations to keep your family protected.',                        'syringe',     '8')
  ) AS s(name, description, icon, display_order)
  ON CONFLICT (tenant_id, lower(name)) DO NOTHING;

  -- 3. Five default departments.
  INSERT INTO website_departments (tenant_id, name, description, icon, display_order, active)
  SELECT p_tenant_id, s.name, s.description, s.icon, s.display_order::integer, true
  FROM (VALUES
    ('Outpatient & Consulting', 'Walk-in and scheduled consultations across family medicine and specialties.', 'stethoscope', '1'),
    ('Laboratory Services',     'Full-service lab for blood, microbiology, histopathology and imaging.',       'flask',       '2'),
    ('Pharmacy',                'In-house pharmacy with a full medicines formulary.',                          'pill',        '3'),
    ('Maternity & Pediatrics',  'Antenatal, delivery and newborn care in a family-friendly ward.',              'baby',        '4'),
    ('Emergency & Trauma',      'Round-the-clock emergency team with resuscitation and triage.',                'ambulance',   '5')
  ) AS s(name, description, icon, display_order)
  ON CONFLICT (tenant_id, lower(name)) DO NOTHING;

  -- 4. A default About page (the only CMS page the public site reads today).
  INSERT INTO website_pages (tenant_id, slug, title, content, seo_title, seo_description, published)
  VALUES (
    p_tenant_id,
    'about',
    'About ' || v_name,
    jsonb_build_object(
      'sections', jsonb_build_array(
        jsonb_build_object('heading', 'Welcome to ' || v_name,
          'body', v_name ||
            ' is a modern healthcare provider devoted to accessible, high-quality care. ' ||
            'We combine experienced clinicians, up-to-date diagnostics and a warm, human touch ' ||
            'with online booking and a patient portal for a seamless experience.'),
        jsonb_build_object('heading', 'Our mission',
          'body', 'To make quality healthcare simple and available to every person in our community.'))
    ),
    'About ' || v_name,
    v_name || ' — modern, accessible healthcare for our community.',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  UPDATE tenants SET website_provisioned = true WHERE id = p_tenant_id;
END $$;

-- Grant to the API layer (service role) + authenticated users (RLS owners).
GRANT EXECUTE ON FUNCTION public.seed_website_defaults(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_website_defaults(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public view: expose website_enabled (site gate). website_provisioned stays
-- internal (admin concerns only).
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
  website->>'emergency_phone' AS emergency_phone,
  website->'opening_hours' AS opening_hours,
  website->'social' AS social,
  website->>'seo_title' AS seo_title,
  website->>'seo_description' AS seo_description,
  website->>'favicon_url' AS favicon_url
FROM tenants
WHERE is_active = true;

GRANT SELECT ON public.tenant_public_profile TO anon;

-- ---------------------------------------------------------------------------
-- Backfill: existing tenants keep their current site (often still fallback),
-- but are flagged provisioned so the wizard is NOT forced on them — they use
-- the Settings "Provision default website" button instead.
-- ---------------------------------------------------------------------------
UPDATE tenants SET website_provisioned = true WHERE website_provisioned = false;