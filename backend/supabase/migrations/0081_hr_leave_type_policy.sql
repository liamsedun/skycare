-- ============================================================================
-- SKYCARE — MIGRATION 0081: HR LEAVE TYPE POLICY
--
-- Purpose: per-tenant annual leave entitlements (days per leave type per
-- year) configurable by HR admins. Previously hardcoded in
-- hr_sync_leave_balances (21/10/3/5, maternity 0, no paternity).
--
--   * hr_leave_type_policy table (tenant_id, leave_type) -> entitled_days
--   * staff_leave CHECK extended: + emergency, paternity
--   * leave_balances CHECK extended: + paternity
--   * hr_sync_leave_balances REWRITTEN: policy-aware with built-in defaults,
--     and entitled_days now UPSERTs (policy changes propagate to balances)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Allow the new leave types on requests and balances
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_leave DROP CONSTRAINT IF EXISTS staff_leave_leave_type_check;
ALTER TABLE public.staff_leave ADD CONSTRAINT staff_leave_leave_type_check
  CHECK (leave_type IN ('annual','sick','study','unpaid','maternity','emergency','paternity'));

ALTER TABLE public.leave_balances DROP CONSTRAINT IF EXISTS leave_balances_leave_type_check;
ALTER TABLE public.leave_balances ADD CONSTRAINT leave_balances_leave_type_check
  CHECK (leave_type IN ('annual','sick','emergency','study','unpaid','maternity','paternity'));

-- ---------------------------------------------------------------------------
-- 2. Policy table (defaults seeded per tenant; editable via /api/hr/leave-policy)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_type_policy (
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leave_type   text NOT NULL
               CHECK (leave_type IN ('annual','sick','emergency','study','unpaid','maternity','paternity')),
  entitled_days numeric(5,1) NOT NULL CHECK (entitled_days >= 0 AND entitled_days <= 365),
  updated_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_hr_leave_type_policy PRIMARY KEY (tenant_id, leave_type)
);

CREATE INDEX IF NOT EXISTS idx_hr_leave_policy_tenant ON public.hr_leave_type_policy (tenant_id);

INSERT INTO public.hr_leave_type_policy (tenant_id, leave_type, entitled_days)
SELECT t.id, x.leave_type, x.days
  FROM public.tenants t
 CROSS JOIN (VALUES
   ('annual', 21), ('sick', 10), ('emergency', 3), ('study', 5),
   ('maternity', 60), ('paternity', 5), ('unpaid', 0)
 ) AS x(leave_type, days)
ON CONFLICT (tenant_id, leave_type) DO NOTHING;

ALTER TABLE public.hr_leave_type_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_leave_policy_staff_read ON public.hr_leave_type_policy;
CREATE POLICY hr_leave_policy_staff_read ON public.hr_leave_type_policy
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() AND u.tenant_id = hr_leave_type_policy.tenant_id)
  );

GRANT SELECT ON public.hr_leave_type_policy TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sync function — policy-aware with built-in defaults; upserts entitlement
--    so editing the policy in a running year propagates to all balances.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_sync_leave_balances(p_tenant uuid)
RETURNS int LANGUAGE plpgsql AS $fn$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_n int := 0;
BEGIN
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
  ON CONFLICT (staff_id, leave_year, leave_type) DO UPDATE
    SET entitled_days = EXCLUDED.entitled_days, updated_at = now();

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

COMMIT;