-- ============================================================================
-- SKYCARE — MIGRATION 0024: PRESCRIPTION STATUS ENUM EXTENSION
--
-- The prescription workflow needs richer states than the legacy enum
-- (active/completed/cancelled/dispensed/partially_dispensed). New lifecycle:
--
--     pending -> processing -> dispensed   (or partial -> dispensed)
--                 |-> cancelled (terminal)
--
-- Adds: pending, processing, partial. Legacy values are kept in the enum so
-- historic rows and old code keep working; data is migrated (and old values
-- retired at the API layer) in migration 0025.
--
-- NOTE: new enum values must NOT be used inside the same transaction that
-- adds them (Postgres restriction), hence this tiny migration stands alone
-- and commits before 0025 runs. `db push` applies each file in its own tx.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumtypid = 'prescription_status'::regtype
                   AND enumlabel = 'pending') THEN
    ALTER TYPE prescription_status ADD VALUE 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumtypid = 'prescription_status'::regtype
                   AND enumlabel = 'processing') THEN
    ALTER TYPE prescription_status ADD VALUE 'processing';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumtypid = 'prescription_status'::regtype
                   AND enumlabel = 'partial') THEN
    ALTER TYPE prescription_status ADD VALUE 'partial';
  END IF;
END $$;