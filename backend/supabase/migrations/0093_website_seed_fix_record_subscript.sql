-- 0093_website_seed_fix_record_subscript.sql
-- Bug fix for seed_website_defaults: the original 0091 body used
-- `FROM (VALUES (...)) AS s(v)` with a single alias over a multi-column
-- VALUES row, making `s` a record not an array — `v[1]` etc. threw
-- "cannot subscript type text". Re-created with explicit column aliases.
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