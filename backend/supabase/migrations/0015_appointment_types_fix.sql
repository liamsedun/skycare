-- 0015_appointment_types_fix.sql
-- The appointments UI offers telemedicine / home_visit / follow_up types, but
-- the original CHECK constraint only allowed in_person/video_call/telephone,
-- causing "appointments_type_check" violations on booking. Align the column.
-- Idempotent. Run via `npx supabase db push` from backend\supabase.

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_type_check
  CHECK (type IN ('in_person', 'video_call', 'telephone', 'telemedicine', 'home_visit', 'follow_up'));
