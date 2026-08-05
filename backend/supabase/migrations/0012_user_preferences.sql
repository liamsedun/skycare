-- 0012_user_preferences.sql
-- Personal account preferences for every staff user (jsonb, all optional keys).
-- Idempotent. Applied via `npx supabase db push` from backend\supabase.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;