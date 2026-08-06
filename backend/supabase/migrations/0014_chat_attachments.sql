-- 0014_chat_attachments.sql
-- Chat message attachments (photos, documents, voice notes) + public storage bucket.
-- Idempotent. Run via `npx supabase db push` from backend\supabase.

-- Attachment metadata on chat messages; message becomes nullable so an
-- attachment-only message is valid.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_url  text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_size integer;

ALTER TABLE chat_messages ALTER COLUMN message DROP NOT NULL;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_check;

CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment
  ON chat_messages (chat_id, created_at ASC)
  WHERE attachment_url IS NOT NULL;

-- Public storage bucket for chat attachments (both staff and patients must be
-- able to view shared photos/voice notes; uploads flow through the API with
-- the service role, which bypasses RLS).
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_attachments_public_read'
  ) THEN
    CREATE POLICY "chat_attachments_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'chat-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'chat_attachments_insert_chat_folder'
  ) THEN
    CREATE POLICY "chat_attachments_insert_chat_folder"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'chat-attachments'
        AND (storage.foldername(name))[1] = 'chats'
      );
  END IF;
END $$;
