-- Migration 0110: Add branch_id to payments, staff_leave, and audit_logs
-- Enables branch-level filtering for billing, leave, and audit trail.

-- 1. payments — attribute payments to a branch (inherit from invoice or pharmacy invoice)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id) WHERE branch_id IS NOT NULL;

-- Backfill from parent invoice where available
UPDATE payments p
SET branch_id = i.branch_id
FROM invoices i
WHERE p.invoice_id = i.id AND p.branch_id IS NULL AND i.branch_id IS NOT NULL;

-- 2. staff_leave — attribute leave requests to a branch (inherit from staff)
ALTER TABLE staff_leave ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_leave_branch ON staff_leave(branch_id) WHERE branch_id IS NOT NULL;

-- Backfill from staff's branch
UPDATE staff_leave sl
SET branch_id = u.branch_id
FROM users u
WHERE sl.user_id = u.id AND sl.branch_id IS NULL AND u.branch_id IS NOT NULL;

-- 3. audit_logs — attribute audit entries to a branch (no FK — audit trail survives branch deletion)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS branch_id uuid;
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON audit_logs(branch_id) WHERE branch_id IS NOT NULL;

-- RLS policies for payments (branch-scoped like patients/appointments)
DROP POLICY IF EXISTS payments_own ON payments;
CREATE POLICY payments_own ON payments
  FOR ALL USING (
    tenant_id = get_tenant_id()
    AND (
      is_hospital_admin()
      OR get_branch_id() IS NULL
      OR branch_id IS NULL
      OR branch_id = get_branch_id()
    )
  );

-- RLS policies for staff_leave (branch-scoped)
DROP POLICY IF EXISTS staff_leave_own ON staff_leave;
CREATE POLICY staff_leave_own ON staff_leave
  FOR ALL USING (
    tenant_id = get_tenant_id()
    AND (
      is_hospital_admin()
      OR get_branch_id() IS NULL
      OR branch_id IS NULL
      OR branch_id = get_branch_id()
    )
  );

-- audit_logs stays tenant-level only (cross-branch audit is intentional for admins)
-- No RLS change needed — existing policies are fine.
