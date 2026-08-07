-- ============================================================================
-- SKYCARE — MIGRATION 0028: PRESCRIPTION EVENT TRIGGER CAST FIX
--
-- The status-change trigger called notify_prescription_event(NEW.id,
-- NEW.status) where NEW.status is the prescription_status enum — Postgres
-- resolution refused the implicit enum->text cast:
--   "function notify_prescription_event(uuid, prescription_status) does not exist"
-- Fix: cast the status argument explicitly.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_prescription_event_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_prescription_event(NEW.id, 'created');
  ELSE
    PERFORM notify_prescription_event(NEW.id, NEW.status::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;