-- 0006_storage_buckets.sql
-- Private storage buckets for tenant assets. Idempotent.
-- RLS policies on storage.objects are added in a follow-up migration
-- once bucket-level tenant scoping rules are finalized.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('hospital-assets', 'hospital-assets', false),
  ('lab-reports',     'lab-reports',     false),
  ('prescriptions',   'prescriptions',   false),
  ('invoices',        'invoices',        false),
  ('patient-docs',    'patient-docs',    false)
ON CONFLICT (id) DO NOTHING;
