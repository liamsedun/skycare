-- ============================================================================
-- SKYCARE — MIGRATION 0085: STAFF-TO-STAFF CHAT
--
-- The Chat module was strictly patient <-> staff. Staff now need to message
-- each other too, and the Staff tab lists those conversations. A chat row is
-- now EITHER a patient <-> staff chat (patient_id set, other_staff_user_id
-- NULL) OR a staff <-> staff chat (patient_id NULL, both staff ids held in
-- staff_user_id + other_staff_user_id). The API layer (service client) stays
-- the authoritative guard; this migration only relaxes the schema.
--
-- Idempotent (ALTER ... IF NOT EXISTS / DO blocks). Safe on existing data:
-- every existing row keeps patient_id NOT NULL, so constraint additions
-- cannot fail.
-- ============================================================================

-- 1. patient_id is no longer required.
ALTER TABLE public.chats ALTER COLUMN patient_id DROP NOT NULL;

-- 2. The second staff member of a staff <-> staff chat.
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS other_staff_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

-- 3. A chat involves either a patient OR a second staff member, never both and
--    never neither; and a staff member cannot chat with themselves.
DO $$
BEGIN
  ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chk_chat_party;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.chats ADD CONSTRAINT chk_chat_party CHECK (
  (patient_id IS NOT NULL AND other_staff_user_id IS NULL)
  OR
  (patient_id IS NULL AND other_staff_user_id IS NOT NULL)
);

DO $$
BEGIN
  ALTER TABLE public.chats DROP CONSTRAINT IF EXISTS chk_chat_no_self;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE public.chats ADD CONSTRAINT chk_chat_no_self CHECK (other_staff_user_id IS DISTINCT FROM staff_user_id);

-- 4. One chat per staff <-> staff pair regardless of direction. NULL
--    patient_id rows are ignored by the existing uq_chat_pair unique
--    constraint (Postgres treats NULLs as distinct), so a dedicated partial
--    index is required.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_staff_staff_pair
  ON public.chats (LEAST(staff_user_id, other_staff_user_id), GREATEST(staff_user_id, other_staff_user_id))
  WHERE patient_id IS NULL;

-- 5. Lookup index for "conversations where I am the second staff member".
CREATE INDEX IF NOT EXISTS idx_chats_other_staff ON public.chats (other_staff_user_id);
