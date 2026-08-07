-- ============================================================================
-- SKYCARE — MIGRATION 0030: INTERNAL MAIL ATTACHMENTS
--
-- Attachments (document URLs, e.g. the prescription PDF) stored as a text[]
-- on the message, surfaced by the inbox API + UI.
-- ============================================================================

ALTER TABLE internal_messages
  ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';