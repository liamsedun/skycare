-- 0083: payroll_records.updated_at
-- Migration 0059 attached trg_payroll_records_updated_at (update_timestamp() sets
-- NEW.updated_at) but payroll_records was defined WITHOUT an updated_at column —
-- every UPDATE on payroll_records (re-run rebuild, approve/unapprove, adjust)
-- failed with: record "new" has no field "updated_at".
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();