-- 0087_patients_avatar_url.sql
-- Life Blossom family-page parity: dependant cards/modal show a photo.
-- The public `avatars` bucket already exists (migration 0010); patients store
-- their public URL here (staff users use users.avatar_url via /api/uploads/avatar).
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS avatar_url text;