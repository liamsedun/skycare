-- 0010_profile_features.sql
-- Public avatars bucket + storage policies for user profile photos.
-- Idempotent. Run via `npx supabase db push` from backend\supabase.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read (avatar URLs render in the app and portal without auth).
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Staff/patients may upload their own avatar folder users/<uid>/ (folder = users/<uid>).
-- Service-role uploads bypass RLS entirely, so this covers future direct client uploads.
CREATE POLICY "avatars_insert_own_folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Owners may delete/update their own avatars.
CREATE POLICY "avatars_update_own_folder"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own_folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'users'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
