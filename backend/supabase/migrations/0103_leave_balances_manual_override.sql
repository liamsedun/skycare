-- 0103_leave_balances_manual_override.sql
-- Fix: hr_sync_leave_balances resets admin-edited entitled_days on every GET.
-- Add manual_override flag so sync preserves admin edits.

BEGIN;

-- 1. Add flag column
ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false;

-- 2. Rebuild hr_sync_leave_balances: seed new rows only, skip manually_overridden ones
CREATE OR REPLACE FUNCTION public.hr_sync_leave_balances(p_tenant uuid)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_n int := 0;
BEGIN
  -- Seed new staff × leave-type rows (ON CONFLICT DO NOTHING — never overwrite)
  INSERT INTO public.leave_balances (tenant_id, branch_id, staff_id, leave_year, leave_type, entitled_days)
  SELECT st.tenant_id, st.branch_id, st.id, v_year, t.t,
         COALESCE((SELECT p.entitled_days FROM public.hr_leave_type_policy p
                    WHERE p.tenant_id = p_tenant AND p.leave_type = t.t),
                  t.days)
    FROM public.staff st
    CROSS JOIN (VALUES
      ('annual', 21), ('sick', 10), ('emergency', 3), ('study', 5),
      ('maternity', 60), ('paternity', 5), ('unpaid', 0)
    ) AS t(t, days)
   WHERE st.tenant_id = p_tenant
  ON CONFLICT (staff_id, leave_year, leave_type) DO NOTHING;

  -- Recalculate used_days for all current-year rows
  UPDATE public.leave_balances lb SET used_days = COALESCE((
    SELECT SUM(sl.days) FROM public.staff_leave sl JOIN public.staff st ON st.user_id = sl.user_id
     WHERE st.id = lb.staff_id AND sl.status = 'approved'
       AND EXTRACT(YEAR FROM sl.start_date) = lb.leave_year AND sl.leave_type = lb.leave_type), 0)
   WHERE lb.tenant_id = p_tenant AND lb.leave_year = v_year;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

-- 3. Mark existing rows with non-default entitled_days as manually overridden
UPDATE public.leave_balances lb
   SET manual_override = true
 WHERE lb.manual_override = false
   AND lb.entitled_days != COALESCE(
     (SELECT p.entitled_days FROM public.hr_leave_type_policy p
       WHERE p.tenant_id = lb.tenant_id AND p.leave_type = lb.leave_type),
     CASE lb.leave_type
       WHEN 'annual' THEN 21 WHEN 'sick' THEN 10 WHEN 'emergency' THEN 3
       WHEN 'study' THEN 5 WHEN 'maternity' THEN 60 WHEN 'paternity' THEN 5
       ELSE 0
     END
   );

COMMIT;
