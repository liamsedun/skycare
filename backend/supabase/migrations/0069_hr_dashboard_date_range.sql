-- ============================================================================
-- 0069 — HR DASHBOARD CUSTOM DATE RANGE
--  hr_dashboard gains optional p_from/p_to so the HR dashboard can drill into
--  any period. Attendance and leave figures fall back to the current month
--  when p_from is NULL (identical behaviour to before).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.hr_dashboard(uuid, uuid);

CREATE OR REPLACE FUNCTION public.hr_dashboard(
  p_tenant uuid,
  p_branch uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_staff jsonb;
  v_today jsonb;
  v_month jsonb;
  v_leave jsonb;
  v_payroll jsonb;
  v_shifts jsonb;
  v_creds jsonb;
  v_month_start date := COALESCE(p_from, date_trunc('month', CURRENT_DATE)::date);
  v_month_end date := COALESCE(p_to, (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date);
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

GRANT EXECUTE ON FUNCTION public.hr_dashboard(uuid, uuid, date, date) TO authenticated;

COMMIT;
