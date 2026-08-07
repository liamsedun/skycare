-- ============================================================================
-- SKYCARE — MIGRATION 0017: ADDITIONAL HOSPITAL ROLES
-- Extends the app_role enum with the full set of hospital staff roles and
-- grants them staff-level RLS access via is_staff().
-- Idempotent.
-- ============================================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'medical_officer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'surgeon';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'anesthesiologist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'radiologist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'radiographer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'physiotherapist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dentist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'optometrist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'dietician';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'medical_records';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hr_officer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'it_support';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'security';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'ward_orderly';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hmo_officer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'paramedic';

-- Staff RLS gate: every staff role (existing + new) can read/write
-- tenant-scoped records the same way the existing staff roles do.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT get_role() IN ('hospital_admin','doctor','nurse','pharmacist','lab_tech',
                        'cashier','receptionist','medical_officer','surgeon','anesthesiologist',
                        'radiologist','radiographer','physiotherapist','dentist','optometrist',
                        'dietician','medical_records','accountant','hr_officer','it_support',
                        'security','ward_orderly','hmo_officer','paramedic');
$$;
