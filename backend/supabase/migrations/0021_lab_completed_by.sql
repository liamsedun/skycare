-- ============================================================================
-- SKYCARE — MIGRATION 0021: LAB REQUESTS — COMPLETED-BY TRACKING
--
-- The lab clinician/technician who carried out the testing is captured when
-- the request transitions to 'completed'. This powers the lab request PDF
-- printout ("lab clinician/technician" field).
-- Idempotent.
-- ============================================================================

ALTER TABLE lab_requests
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_requests_completed_by ON lab_requests (completed_by) WHERE completed_by IS NOT NULL;
