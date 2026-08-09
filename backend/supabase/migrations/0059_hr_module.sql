-- ============================================================================
-- 0059 — HR MANAGEMENT MODULE
-- Extends the existing Staff & Admin module WITHOUT modifying its tables.
--   * staff, attendance, staff_leave, duty_roster: REUSED as-is (source of truth)
--   * NEW tables: staff_profiles, shifts, staff_shifts, leave_balances,
--     payroll_records, payroll_lines, staff_credentials, roles_permissions
--   * NEW RPCs: hr_clock_in/out, hr_mark_missed_shifts, hr_sync_leave_balances,
--     hr_assign_shift (conflict + credential guards), hr_run_payroll,
--     hr_dashboard, hr_init_profiles, hr_seed_role_permissions
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. STAFF PROFILES (1:1 HR extension of staff — employment/hiring/banking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id            uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id             uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  hire_date            date,
  salary_grade         text,
  bank_account_name    text,
  bank_name            text,
  bank_account_number  text,
  credentials_status   text NOT NULL DEFAULT 'pending'
                       CHECK (credentials_status IN ('pending','verified','expired')),
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_profiles_staff UNIQUE (staff_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_tenant ON staff_profiles (tenant_id);

-- ============================================================================
-- 2. SHIFT TEMPLATES (named, department/ward-scoped)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  name        text NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  department  text,
  ward_id     uuid REFERENCES wards(id) ON DELETE SET NULL,
  color       text NOT NULL DEFAULT '#0ea5e9',
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_tenant_name ON public.shifts (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_ward ON shifts (ward_id);

-- ============================================================================
-- 3. STAFF SHIFT ASSIGNMENTS (the HR roster — one shift per staff per day,
--    mirroring duty_roster's uniqueness; cross-checked against duty_roster)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shift_id    uuid REFERENCES shifts(id) ON DELETE SET NULL,
  ward_id     uuid REFERENCES wards(id) ON DELETE SET NULL,
  shift_date  date NOT NULL,
  status      text NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled','completed','missed','cancelled')),
  notes       text,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_staff_shifts_day UNIQUE (staff_id, shift_date)
);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_tenant ON staff_shifts (tenant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_staff ON staff_shifts (staff_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_status ON staff_shifts (tenant_id, status);

-- Conflict guard: an HR shift assignment must never double-book a staffer who
-- already has a duty_roster entry for the same date (legacy scheduler).
CREATE OR REPLACE FUNCTION public.hr_shift_conflict_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.duty_roster dr
    WHERE dr.staff_id = NEW.staff_id AND dr.shift_date = NEW.shift_date;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'SHIFT_CONFLICT: staff already has a duty roster entry on %', NEW.shift_date;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_staff_shifts_conflict ON public.staff_shifts;
CREATE TRIGGER trg_staff_shifts_conflict
  BEFORE INSERT OR UPDATE ON public.staff_shifts
  FOR EACH ROW EXECUTE FUNCTION public.hr_shift_conflict_guard();

-- ============================================================================
-- 4. LEAVE BALANCES (entitlement tracking; used_days derived from approved
--    staff_leave so the existing leave module stays untouched)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id      uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_year    int NOT NULL,
  leave_type    text NOT NULL DEFAULT 'annual'
                CHECK (leave_type IN ('annual','sick','emergency','study','unpaid','maternity')),
  entitled_days numeric(5,1) NOT NULL DEFAULT 0,
  used_days     numeric(5,1) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_leave_balances_key UNIQUE (staff_id, leave_year, leave_type)
);
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant ON leave_balances (tenant_id, leave_year);

-- ============================================================================
-- 5. PAYROLL (records + line items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id       uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  pay_period     text NOT NULL,             -- 'YYYY-MM'
  base_salary    numeric(12,2) NOT NULL DEFAULT 0,
  allowances     numeric(12,2) NOT NULL DEFAULT 0,
  deductions     numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay   numeric(12,2) NOT NULL DEFAULT 0,
  bonus          numeric(12,2) NOT NULL DEFAULT 0,
  net_salary     numeric(12,2) NOT NULL DEFAULT 0,
  worked_days    int NOT NULL DEFAULT 0,
  absent_days    int NOT NULL DEFAULT 0,
  overtime_hours numeric(8,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','paid')),
  generated_at   timestamptz NOT NULL DEFAULT now(),
  approved_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  notes          text,
  CONSTRAINT uq_payroll_staff_period UNIQUE (staff_id, pay_period)
);
CREATE INDEX IF NOT EXISTS idx_payroll_tenant ON payroll_records (tenant_id, pay_period);
CREATE INDEX IF NOT EXISTS idx_payroll_status ON payroll_records (tenant_id, status);

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payroll_id  uuid NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  line_type   text NOT NULL
              CHECK (line_type IN ('basic','allowance','deduction','overtime','bonus')),
  label       text NOT NULL,
  amount      numeric(12,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_payroll ON payroll_lines (payroll_id);

-- ============================================================================
-- 6. STAFF CREDENTIALS (license / certification compliance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staff_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  staff_id        uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  license_number  text,
  certification   text NOT NULL,
  issuing_body    text,
  expiry_date     date NOT NULL,
  verified        boolean NOT NULL DEFAULT false,
  verified_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  verified_at     timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_credentials_tenant ON staff_credentials (tenant_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_credentials_staff ON staff_credentials (staff_id);

-- ============================================================================
-- 7. ROLE PERMISSIONS (RBAC matrix — policy store read by HR APIs; existing
--    hard-coded role gates are left untouched for backward compatibility)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.roles_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_roles_permissions_key UNIQUE (tenant_id, role)
);
CREATE INDEX IF NOT EXISTS idx_roles_permissions_tenant ON roles_permissions (tenant_id);

-- ============================================================================
-- RLS — new tables follow the tenant-scoped staff pattern used by 0008/0055.
-- Writes flow through the service client / RPCs; SELECT is role-gated.
-- ============================================================================
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_permissions ENABLE ROW LEVEL SECURITY;

-- staff_profiles: any staff reads (tenant), admin/hr writes.
DROP POLICY IF EXISTS staff_profiles_read ON public.staff_profiles;
CREATE POLICY staff_profiles_read ON public.staff_profiles FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
DROP POLICY IF EXISTS staff_profiles_admin ON public.staff_profiles;
CREATE POLICY staff_profiles_admin ON public.staff_profiles
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

-- shifts: any staff reads, admin/hr writes.
DROP POLICY IF EXISTS shifts_read ON public.shifts;
CREATE POLICY shifts_read ON public.shifts FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
DROP POLICY IF EXISTS shifts_admin ON public.shifts;
CREATE POLICY shifts_admin ON public.shifts
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

-- staff_shifts: any staff reads, admin/hr writes.
DROP POLICY IF EXISTS staff_shifts_read ON public.staff_shifts;
CREATE POLICY staff_shifts_read ON public.staff_shifts FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
DROP POLICY IF EXISTS staff_shifts_admin ON public.staff_shifts;
CREATE POLICY staff_shifts_admin ON public.staff_shifts
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

-- leave_balances: any staff reads, admin/hr writes.
DROP POLICY IF EXISTS leave_balances_read ON public.leave_balances;
CREATE POLICY leave_balances_read ON public.leave_balances FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
DROP POLICY IF EXISTS leave_balances_admin ON public.leave_balances;
CREATE POLICY leave_balances_admin ON public.leave_balances
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

-- payroll: staff sees own rows, admin/hr/accountant read all, admin/hr write.
DROP POLICY IF EXISTS payroll_staff_self ON public.payroll_records;
CREATE POLICY payroll_staff_self ON public.payroll_records FOR SELECT
  USING (tenant_id = get_tenant_id() AND
         EXISTS (SELECT 1 FROM public.staff st WHERE st.id = payroll_records.staff_id AND st.user_id = auth.uid()));
DROP POLICY IF EXISTS payroll_hr_read ON public.payroll_records;
CREATE POLICY payroll_hr_read ON public.payroll_records FOR SELECT
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','accountant','super_admin')));
DROP POLICY IF EXISTS payroll_hr_write ON public.payroll_records;
CREATE POLICY payroll_hr_write ON public.payroll_records
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

DROP POLICY IF EXISTS payroll_lines_staff_self ON public.payroll_lines;
CREATE POLICY payroll_lines_staff_self ON public.payroll_lines FOR SELECT
  USING (tenant_id = get_tenant_id() AND EXISTS (
    SELECT 1 FROM public.payroll_records pr JOIN public.staff st ON st.id = pr.staff_id
     WHERE pr.id = payroll_lines.payroll_id AND st.user_id = auth.uid()));
DROP POLICY IF EXISTS payroll_lines_hr_read ON public.payroll_lines;
CREATE POLICY payroll_lines_hr_read ON public.payroll_lines FOR SELECT
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','accountant','super_admin')));

-- credentials: staff sees own, admin/hr read all + write.
DROP POLICY IF EXISTS credentials_staff_self ON public.staff_credentials;
CREATE POLICY credentials_staff_self ON public.staff_credentials FOR SELECT
  USING (tenant_id = get_tenant_id() AND
         EXISTS (SELECT 1 FROM public.staff st WHERE st.id = staff_credentials.staff_id AND st.user_id = auth.uid()));
DROP POLICY IF EXISTS credentials_hr_read ON public.staff_credentials;
CREATE POLICY credentials_hr_read ON public.staff_credentials FOR SELECT
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin') OR is_staff()));
DROP POLICY IF EXISTS credentials_hr_write ON public.staff_credentials;
CREATE POLICY credentials_hr_write ON public.staff_credentials
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

-- roles_permissions: admin/hr only (the permission matrix itself is privileged).
DROP POLICY IF EXISTS roles_permissions_admin ON public.roles_permissions;
CREATE POLICY roles_permissions_admin ON public.roles_permissions
  USING (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')))
  WITH CHECK (tenant_id = get_tenant_id() AND (get_role() IN ('hospital_admin','hr_officer','super_admin')));

-- ============================================================================
-- RPCs
-- ============================================================================

-- Seed a staff_profiles row for every staff member missing one (lazy init).
CREATE OR REPLACE FUNCTION public.hr_init_profiles(p_tenant uuid)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE v_n int;
BEGIN
  INSERT INTO public.staff_profiles (tenant_id, branch_id, staff_id, hire_date)
  SELECT st.tenant_id, st.branch_id, st.id, st.created_at::date
    FROM public.staff st
   WHERE st.tenant_id = p_tenant
     AND NOT EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.staff_id = st.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_init_profiles(uuid) TO authenticated;

-- Clock-in: upsert today's attendance, late detection vs the assigned shift
-- (grace window in minutes), and mark the day's staff_shift as completed.
-- Shift times are hospital wall-clock; attendance is stored UTC, so the late
-- comparison converts now() to the platform business timezone (Africa/Lagos).
CREATE OR REPLACE FUNCTION public.hr_clock_in(
  p_tenant uuid,
  p_user_id uuid,
  p_window_min int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_staff public.staff%ROWTYPE;
  v_shift_start time;
  v_status public.attendance_status := 'present';
  v_att public.attendance%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM public.staff
   WHERE user_id = p_user_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;

  SELECT sh.start_time INTO v_shift_start
    FROM public.staff_shifts ss JOIN public.shifts sh ON sh.id = ss.shift_id
   WHERE ss.staff_id = v_staff.id AND ss.shift_date = CURRENT_DATE AND ss.status = 'scheduled'
   LIMIT 1;

  IF v_shift_start IS NOT NULL
     AND (now() AT TIME ZONE 'Africa/Lagos')::time > (v_shift_start + make_interval(mins => p_window_min)) THEN
    v_status := 'late';
  END IF;

  INSERT INTO public.attendance (tenant_id, branch_id, user_id, work_date, check_in, status)
  VALUES (p_tenant, v_staff.branch_id, p_user_id, CURRENT_DATE, now(), v_status)
  ON CONFLICT (user_id, work_date) DO UPDATE SET status = attendance.status
  RETURNING * INTO v_att;

  UPDATE public.staff_shifts
     SET status = 'completed'
   WHERE staff_id = v_staff.id AND shift_date = CURRENT_DATE AND status = 'scheduled';

  RETURN jsonb_build_object(
    'id', v_att.id, 'status', v_att.status,
    'check_in', v_att.check_in, 'work_date', v_att.work_date,
    'late', v_status = 'late');
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_clock_in(uuid, uuid, int) TO authenticated;

-- Clock-out: stamp today's check_out (first clock-in wins; latest clock-out wins).
CREATE OR REPLACE FUNCTION public.hr_clock_out(p_tenant uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE v_att public.attendance%ROWTYPE;
BEGIN
  UPDATE public.attendance
     SET check_out = now()
   WHERE user_id = p_user_id AND work_date = CURRENT_DATE AND tenant_id = p_tenant
   RETURNING * INTO v_att;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CLOCK_IN'; END IF;
  RETURN jsonb_build_object('id', v_att.id, 'check_out', v_att.check_out);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_clock_out(uuid, uuid) TO authenticated;

-- Auto-mark absence: past scheduled shifts with no check-in become 'missed'
-- and an 'absent' attendance row is recorded (idempotent per user+date).
CREATE OR REPLACE FUNCTION public.hr_mark_missed_shifts(p_tenant uuid, p_branch uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE v_n int;
BEGIN
  UPDATE public.staff_shifts ss
     SET status = 'missed'
   WHERE ss.tenant_id = p_tenant
     AND ss.status = 'scheduled'
     AND ss.shift_date < CURRENT_DATE
     AND (p_branch IS NULL OR ss.branch_id = p_branch)
     AND NOT EXISTS (
       SELECT 1 FROM public.staff st JOIN public.attendance a ON a.user_id = st.user_id
        WHERE st.id = ss.staff_id AND a.work_date = ss.shift_date);

  INSERT INTO public.attendance (tenant_id, branch_id, user_id, work_date, status, notes)
  SELECT ss.tenant_id, st.branch_id, st.user_id, ss.shift_date, 'absent'::public.attendance_status,
         'Auto-marked absent (no check-in)'
    FROM public.staff_shifts ss JOIN public.staff st ON st.id = ss.staff_id
   WHERE ss.tenant_id = p_tenant
     AND ss.shift_date < CURRENT_DATE
     AND ss.status = 'missed'
     AND (p_branch IS NULL OR ss.branch_id = p_branch)
  ON CONFLICT (user_id, work_date) DO NOTHING;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_mark_missed_shifts(uuid, uuid) TO authenticated;

-- Leave balance sync: seed default entitlements for the current year and
-- recompute used_days from APPROVED staff_leave (existing module untouched).
CREATE OR REPLACE FUNCTION public.hr_sync_leave_balances(p_tenant uuid)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_n int := 0;
BEGIN
  INSERT INTO public.leave_balances (tenant_id, branch_id, staff_id, leave_year, leave_type, entitled_days)
  SELECT st.tenant_id, st.branch_id, st.id, v_year, t.t, t.days
    FROM public.staff st
    CROSS JOIN (VALUES ('annual', 21), ('sick', 10), ('emergency', 3), ('study', 5), ('maternity', 0), ('unpaid', 0)) AS t(t, days)
   WHERE st.tenant_id = p_tenant
  ON CONFLICT (staff_id, leave_year, leave_type) DO NOTHING;

  UPDATE public.leave_balances lb SET used_days = COALESCE((
    SELECT SUM(sl.days) FROM public.staff_leave sl JOIN public.staff st ON st.user_id = sl.user_id
     WHERE st.id = lb.staff_id AND sl.status = 'approved'
       AND EXTRACT(YEAR FROM sl.start_date) = lb.leave_year AND sl.leave_type = lb.leave_type), 0)
   WHERE lb.tenant_id = p_tenant AND lb.leave_year = v_year;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_sync_leave_balances(uuid) TO authenticated;

-- Shift assignment with built-in guards:
--   1. no double-booking on the same date (staff_shifts + duty_roster)
--   2. clinical staff must hold a verified, unexpired credential
--      (expiry evaluated against the shift date)
CREATE OR REPLACE FUNCTION public.hr_assign_shift(
  p_tenant uuid,
  p_staff_id uuid,
  p_shift_id uuid,
  p_date date,
  p_ward_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_staff public.staff%ROWTYPE;
  v_users public.users%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_clinical boolean := false;
  v_ok boolean;
  v_row public.staff_shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM public.staff WHERE id = p_staff_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
  SELECT * INTO v_users FROM public.users WHERE id = v_staff.user_id;

  IF v_users.role IN ('doctor','medical_officer','surgeon','anesthesiologist','radiologist',
                      'radiographer','physiotherapist','dentist','optometrist','dietician',
                      'paramedic','nurse') THEN
    v_clinical := true;
  END IF;

  IF v_clinical THEN
    SELECT EXISTS (
      SELECT 1 FROM public.staff_credentials sc
       WHERE sc.staff_id = p_staff_id AND sc.verified
         AND sc.expiry_date >= p_date
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'CREDENTIAL_REQUIRED: staff has no verified, unexpired credential for %', p_date;
    END IF;
  END IF;

  INSERT INTO public.staff_shifts
    (tenant_id, branch_id, staff_id, shift_id, ward_id, shift_date, notes, created_by)
  VALUES (p_tenant, v_staff.branch_id, p_staff_id, p_shift_id,
          COALESCE(p_ward_id, v_shift.ward_id), p_date, p_notes, p_created_by)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'staff_id', v_row.staff_id,
                            'shift_id', v_row.shift_id, 'shift_date', v_row.shift_date);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_assign_shift(uuid, uuid, uuid, date, uuid, text, uuid) TO authenticated;

-- Payroll run for a 'YYYY-MM' period.
--   base     = staff.base_salary (staff without a profile AND base_salary = 0 are skipped)
--   present  = attendance rows with status present/late on scheduled days
--   absent   = scheduled days minus present days (auto-missed shifts included)
--   overtime = hours worked past the assigned shift's end time (time-only, v1)
--   net      = base + allowances + overtime_pay + bonus - deductions
--   Validation: staff with NO scheduled shift AND NO attendance in the period
--   are skipped (no payroll without attendance data) — reported in summary.
CREATE OR REPLACE FUNCTION public.hr_run_payroll(p_tenant uuid, p_period text, p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_start date := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_end date := (v_start + interval '1 month' - interval '1 day')::date;
  v_staff record;
  v_scheduled int;
  v_present int;
  v_absent int;
  v_ot_hours numeric := 0;
  v_ot_pay numeric := 0;
  v_daily numeric := 0;
  v_hourly numeric := 0;
  v_deduction numeric := 0;
  v_net numeric := 0;
  v_rec uuid;
  v_generated int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_total_net numeric := 0;
  v_total_gross numeric := 0;
  v_eff_end time;
BEGIN
  IF v_start IS NULL OR p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_PERIOD';
  END IF;

  FOR v_staff IN
    SELECT st.id, st.user_id, st.base_salary, st.branch_id
      FROM public.staff st
     WHERE st.tenant_id = p_tenant
       AND (p_branch IS NULL OR st.branch_id = p_branch)
       AND (st.base_salary IS NOT NULL AND st.base_salary > 0
            OR EXISTS (SELECT 1 FROM public.staff_profiles sp WHERE sp.staff_id = st.id))
  LOOP
    SELECT COUNT(*) INTO v_scheduled FROM public.staff_shifts ss
     WHERE ss.staff_id = v_staff.id AND ss.shift_date BETWEEN v_start AND v_end
       AND ss.status <> 'cancelled';

    SELECT COUNT(*) INTO v_present FROM public.attendance a
     WHERE a.user_id = v_staff.user_id AND a.work_date BETWEEN v_start AND v_end
       AND a.status IN ('present','late');

    IF v_scheduled = 0 AND v_present = 0 THEN
      v_skipped := v_skipped || jsonb_build_object('staff_id', v_staff.id, 'reason', 'no_attendance_data');
      CONTINUE;
    END IF;

    v_absent := GREATEST(0, v_scheduled - v_present);

    SELECT COALESCE(SUM(
        GREATEST(0, EXTRACT(EPOCH FROM ((a.check_out AT TIME ZONE 'Africa/Lagos')::time -
          (CASE WHEN sh.end_time <= sh.start_time THEN sh.end_time + interval '24 hours'
                ELSE sh.end_time END)::time)) / 3600.0)), 0)::numeric
      INTO v_ot_hours
      FROM public.attendance a
      JOIN public.staff_shifts ss ON ss.staff_id = v_staff.id AND ss.shift_date = a.work_date
      JOIN public.shifts sh ON sh.id = ss.shift_id
     WHERE a.user_id = v_staff.user_id AND a.work_date BETWEEN v_start AND v_end
       AND a.check_in IS NOT NULL AND a.check_out IS NOT NULL
       AND a.status IN ('present','late');

    v_ot_hours := ROUND(v_ot_hours, 2);
    v_daily := ROUND(COALESCE(v_staff.base_salary, 0) / 30, 2);
    v_hourly := ROUND(COALESCE(v_staff.base_salary, 0) / 160, 4);
    v_ot_pay := ROUND(v_ot_hours * v_hourly * 1.5, 2);
    v_deduction := ROUND(v_absent * v_daily, 2);
    v_net := ROUND(COALESCE(v_staff.base_salary, 0) + v_ot_pay - v_deduction, 2);

    INSERT INTO public.payroll_records
      (tenant_id, branch_id, staff_id, pay_period, base_salary, allowances, deductions,
       overtime_pay, bonus, net_salary, worked_days, absent_days, overtime_hours, notes)
    VALUES (p_tenant, v_staff.branch_id, v_staff.id, p_period, COALESCE(v_staff.base_salary, 0),
            0, v_deduction, v_ot_pay, 0, v_net, v_present, v_absent, v_ot_hours,
            'Auto-generated from attendance and shift data')
    ON CONFLICT (staff_id, pay_period) DO UPDATE SET
      base_salary = EXCLUDED.base_salary,
      allowances  = payroll_records.allowances,
      deductions  = EXCLUDED.deductions,
      overtime_pay = EXCLUDED.overtime_pay,
      bonus       = payroll_records.bonus,
      net_salary  = ROUND(EXCLUDED.base_salary + payroll_records.allowances +
                          EXCLUDED.overtime_pay + payroll_records.bonus - EXCLUDED.deductions, 2),
      worked_days = EXCLUDED.worked_days,
      absent_days = EXCLUDED.absent_days,
      overtime_hours = EXCLUDED.overtime_hours,
      generated_at = now()
    RETURNING id INTO v_rec;

    DELETE FROM public.payroll_lines WHERE payroll_id = v_rec;
    INSERT INTO public.payroll_lines (tenant_id, payroll_id, line_type, label, amount)
    VALUES (p_tenant, v_rec, 'basic', 'Base salary', COALESCE(v_staff.base_salary, 0));
    IF v_ot_pay > 0 THEN
      INSERT INTO public.payroll_lines (tenant_id, payroll_id, line_type, label, amount)
      VALUES (p_tenant, v_rec, 'overtime', v_ot_hours || ' overtime hour(s)', v_ot_pay);
    END IF;
    IF v_deduction > 0 THEN
      INSERT INTO public.payroll_lines (tenant_id, payroll_id, line_type, label, amount)
      VALUES (p_tenant, v_rec, 'deduction', v_absent || ' absent day(s)', v_deduction);
    END IF;

    v_generated := v_generated + 1;
    v_total_net := v_total_net + v_net;
    v_total_gross := v_total_gross + COALESCE(v_staff.base_salary, 0) + v_ot_pay;
  END LOOP;

  RETURN jsonb_build_object(
    'period', p_period,
    'generated', v_generated,
    'skipped', v_skipped,
    'total_gross', ROUND(v_total_gross, 2),
    'total_net', ROUND(v_total_net, 2));
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_run_payroll(uuid, text, uuid) TO authenticated;

-- ============================================================================
-- HR DASHBOARD (single call: staff census, attendance, leave, payroll,
-- shift coverage, credential alerts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.hr_dashboard(p_tenant uuid, p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_staff jsonb;
  v_today jsonb;
  v_month jsonb;
  v_leave jsonb;
  v_payroll jsonb;
  v_shifts jsonb;
  v_creds jsonb;
  v_month_start date := date_trunc('month', CURRENT_DATE)::date;
  v_month_end date := (v_month_start + interval '1 month' - interval '1 day')::date;
  v_active_staff int;
  v_sched_today int;
  v_present_today int;
  v_present_month int;
  v_sched_month int;
  v_last_period text;
BEGIN
  SELECT COUNT(*) INTO v_active_staff
    FROM public.staff st JOIN public.users u ON u.id = st.user_id
   WHERE st.tenant_id = p_tenant AND u.is_active
     AND (p_branch IS NULL OR st.branch_id = p_branch);

  SELECT COUNT(*) INTO v_sched_today FROM public.staff_shifts ss
   WHERE ss.tenant_id = p_tenant AND ss.shift_date = CURRENT_DATE AND ss.status <> 'cancelled'
     AND (p_branch IS NULL OR ss.branch_id = p_branch);

  SELECT COUNT(*) INTO v_present_today FROM public.attendance a JOIN public.staff st ON st.user_id = a.user_id
   WHERE a.tenant_id = p_tenant AND a.work_date = CURRENT_DATE AND a.status IN ('present','late')
     AND (p_branch IS NULL OR st.branch_id = p_branch);

  SELECT COUNT(*) INTO v_present_month FROM public.attendance a JOIN public.staff st ON st.user_id = a.user_id
   WHERE a.tenant_id = p_tenant AND a.work_date BETWEEN v_month_start AND v_month_end
     AND a.status IN ('present','late')
     AND (p_branch IS NULL OR st.branch_id = p_branch);

  SELECT COUNT(*) INTO v_sched_month FROM public.staff_shifts ss
   WHERE ss.tenant_id = p_tenant AND ss.shift_date BETWEEN v_month_start AND v_month_end
     AND ss.status <> 'cancelled'
     AND (p_branch IS NULL OR ss.branch_id = p_branch);

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (WHERE u.is_active),
    'by_department', (SELECT COALESCE(jsonb_object_agg(d.department, d.cnt), '{}'::jsonb)
                        FROM (SELECT COALESCE(st.department, 'Unassigned') AS department, COUNT(*) AS cnt
                                FROM public.staff st WHERE st.tenant_id = p_tenant
                                  AND (p_branch IS NULL OR st.branch_id = p_branch)
                               GROUP BY 1) d),
    'on_leave', COUNT(*) FILTER (WHERE st.on_leave_until IS NOT NULL AND st.on_leave_until >= CURRENT_DATE)
  ) INTO v_staff
    FROM public.staff st JOIN public.users u ON u.id = st.user_id
   WHERE st.tenant_id = p_tenant
     AND (p_branch IS NULL OR st.branch_id = p_branch);

  v_today := jsonb_build_object(
    'present', v_present_today,
    'absent', (SELECT COUNT(*) FROM public.attendance a JOIN public.staff st ON st.user_id = a.user_id
                WHERE a.tenant_id = p_tenant AND a.work_date = CURRENT_DATE AND a.status = 'absent'
                  AND (p_branch IS NULL OR st.branch_id = p_branch)),
    'late', (SELECT COUNT(*) FROM public.attendance a JOIN public.staff st ON st.user_id = a.user_id
              WHERE a.tenant_id = p_tenant AND a.work_date = CURRENT_DATE AND a.status = 'late'
                AND (p_branch IS NULL OR st.branch_id = p_branch)),
    'scheduled', v_sched_today,
    'coverage', ROUND(COALESCE(v_present_today * 100.0 / NULLIF(v_sched_today, 0), 0), 1));

  v_month := jsonb_build_object(
    'present', v_present_month,
    'late', (SELECT COUNT(*) FROM public.attendance a JOIN public.staff st ON st.user_id = a.user_id
              WHERE a.tenant_id = p_tenant AND a.work_date BETWEEN v_month_start AND v_month_end
                AND a.status = 'late' AND (p_branch IS NULL OR st.branch_id = p_branch)),
    'absent', (SELECT COUNT(*) FROM public.attendance a JOIN public.staff st ON st.user_id = a.user_id
                WHERE a.tenant_id = p_tenant AND a.work_date BETWEEN v_month_start AND v_month_end
                  AND a.status = 'absent' AND (p_branch IS NULL OR st.branch_id = p_branch)),
    'scheduled', v_sched_month,
    'rate', ROUND(COALESCE(v_present_month * 100.0 / NULLIF(v_sched_month, 0), 0), 1));

  SELECT jsonb_build_object(
    'pending', (SELECT COUNT(*) FROM public.staff_leave sl JOIN public.staff st ON st.user_id = sl.user_id
                 WHERE sl.tenant_id = p_tenant AND sl.status = 'pending'
                   AND (p_branch IS NULL OR st.branch_id = p_branch)),
    'approved_month', (SELECT COUNT(*) FROM public.staff_leave sl JOIN public.staff st ON st.user_id = sl.user_id
                         WHERE sl.tenant_id = p_tenant AND sl.status = 'approved'
                           AND sl.start_date BETWEEN v_month_start AND v_month_end
                           AND (p_branch IS NULL OR st.branch_id = p_branch)),
    'balances', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'staff_id', lb.staff_id, 'name', u.full_name,
                    'type', lb.leave_type, 'entitled', lb.entitled_days, 'used', lb.used_days)
                    ORDER BY (lb.used_days / NULLIF(lb.entitled_days, 0)) DESC NULLS LAST)
                  , '[]'::jsonb)
                   FROM public.leave_balances lb
                   JOIN public.staff st ON st.id = lb.staff_id
                   JOIN public.users u ON u.id = st.user_id
                  WHERE lb.tenant_id = p_tenant AND lb.leave_year = EXTRACT(YEAR FROM CURRENT_DATE)
                    AND lb.entitled_days > 0
                    AND (p_branch IS NULL OR lb.branch_id = p_branch)))
  INTO v_leave;

  SELECT MAX(pay_period) INTO v_last_period FROM public.payroll_records
   WHERE tenant_id = p_tenant AND (p_branch IS NULL OR branch_id = p_branch);

  SELECT jsonb_build_object(
    'period', v_last_period,
    'records', COUNT(*),
    'gross', COALESCE(SUM(base_salary + allowances + overtime_pay + bonus), 0),
    'net', COALESCE(SUM(net_salary), 0),
    'paid', COUNT(*) FILTER (WHERE status = 'paid')
  ) INTO v_payroll
    FROM public.payroll_records
   WHERE tenant_id = p_tenant AND pay_period = v_last_period
     AND (p_branch IS NULL OR branch_id = p_branch);

  v_shifts := jsonb_build_object(
    'templates', (SELECT COUNT(*) FROM public.shifts
                   WHERE tenant_id = p_tenant AND is_active
                     AND (p_branch IS NULL OR branch_id = p_branch)),
    'assigned_today', v_sched_today,
    'coverage', ROUND(COALESCE(v_sched_today * 100.0 / NULLIF(v_active_staff, 0), 0), 1));

  SELECT jsonb_build_object(
    'expiring', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', sc.id, 'staff_id', sc.staff_id, 'name', u.full_name,
                    'certification', sc.certification, 'license_number', sc.license_number,
                    'expiry_date', sc.expiry_date, 'days_left',
                    (sc.expiry_date - CURRENT_DATE)) ORDER BY sc.expiry_date)
                  , '[]'::jsonb)
                   FROM public.staff_credentials sc
                   JOIN public.staff st ON st.id = sc.staff_id
                   JOIN public.users u ON u.id = st.user_id
                  WHERE sc.tenant_id = p_tenant AND sc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
                    AND (p_branch IS NULL OR sc.branch_id = p_branch)),
    'expired', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', sc.id, 'staff_id', sc.staff_id, 'name', u.full_name,
                    'certification', sc.certification, 'license_number', sc.license_number,
                    'expiry_date', sc.expiry_date) ORDER BY sc.expiry_date)
                  , '[]'::jsonb)
                   FROM public.staff_credentials sc
                   JOIN public.staff st ON st.id = sc.staff_id
                   JOIN public.users u ON u.id = st.user_id
                  WHERE sc.tenant_id = p_tenant AND sc.expiry_date < CURRENT_DATE
                    AND (p_branch IS NULL OR sc.branch_id = p_branch)),
    'verified', (SELECT COUNT(*) FROM public.staff_credentials sc
                  WHERE sc.tenant_id = p_tenant AND sc.verified
                    AND (p_branch IS NULL OR sc.branch_id = p_branch))
  ) INTO v_creds;

  RETURN jsonb_build_object(
    'as_of', now(),
    'staff', v_staff,
    'attendance_today', v_today,
    'attendance_month', v_month,
    'leave', v_leave,
    'payroll', v_payroll,
    'shifts', v_shifts,
    'credentials', v_creds);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_dashboard(uuid, uuid) TO authenticated;

-- Seed default role->permission matrix (lazy init; never overwrites).
CREATE OR REPLACE FUNCTION public.hr_seed_role_permissions(p_tenant uuid)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE v_n int;
BEGIN
  INSERT INTO public.roles_permissions (tenant_id, role, permissions)
  VALUES (p_tenant, 'super_admin',  '{"*": true}'::jsonb),
         (p_tenant, 'hospital_admin','{"*": true}'::jsonb),
         (p_tenant, 'hr_officer',   '{"hr.*": true}'::jsonb),
         (p_tenant, 'accountant',   '{"hr.payroll.view": true}'::jsonb),
         (p_tenant, 'doctor',       '{"prescribe": true, "vitals.write": true, "ward.assign": true}'::jsonb),
         (p_tenant, 'nurse',        '{"vitals.write": true, "ward.assign": true}'::jsonb),
         (p_tenant, 'pharmacist',   '{"pharmacy.dispense": true}'::jsonb),
         (p_tenant, 'cashier',      '{"billing.*": true}'::jsonb),
         (p_tenant, 'medical_records','{"records.write": true}'::jsonb)
  ON CONFLICT (tenant_id, role) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_seed_role_permissions(uuid) TO authenticated;

-- ============================================================================
-- updated_at maintenance for the new tables
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff_profiles','shifts','staff_shifts','leave_balances',
                           'payroll_records','staff_credentials','roles_permissions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION public.update_timestamp()', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- GRANTS (mirror the 0008 hardening: no anon access on the new tables)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON TABLE public.staff_profiles, public.shifts, public.staff_shifts,
              public.leave_balances, public.payroll_records, public.payroll_lines,
              public.staff_credentials, public.roles_permissions FROM anon, public;
GRANT SELECT ON TABLE public.staff_profiles, public.shifts, public.staff_shifts,
              public.leave_balances, public.payroll_records, public.payroll_lines,
              public.staff_credentials, public.roles_permissions TO authenticated;

COMMIT;
