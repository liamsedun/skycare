-- ============================================================================
-- 0058 — WARD FIXES
--  * ward_forecast was broken with "aggregate function calls cannot be
--    nested": the avg() LOS aggregate sat inside jsonb_object_agg()'s value
--    argument (0056 line 20). Rewritten to aggregate in a GROUP BY subquery
--    first, then object_agg over the grouped rows. Same output shape.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ward_forecast(p_tenant uuid, p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_los jsonb;
  v_active jsonb;
  v_occ jsonb;
  v_rate numeric;
BEGIN
  -- Average length of stay (days) by ward_type from completed admissions.
  SELECT COALESCE(jsonb_object_agg(ward_type, round(avg_los, 1)), '{}'::jsonb)
    INTO v_los
    FROM (
      SELECT w.ward_type,
             avg(EXTRACT(EPOCH FROM (a.discharged_at - a.admitted_at)) / 86400.0)::numeric AS avg_los
        FROM public.admissions a
        JOIN public.beds b ON b.id = a.bed_id
        JOIN public.wards w ON w.id = b.ward_id
       WHERE a.tenant_id = p_tenant
         AND a.status = 'discharged'
         AND a.discharged_at IS NOT NULL
         AND (p_branch IS NULL OR w.branch_id = p_branch)
       GROUP BY w.ward_type
    ) los;

  -- Rolling 28-day admit rate (per day) for new-admission expectation.
  SELECT COALESCE(COUNT(*)::numeric / 28.0, 0)
    INTO v_rate
    FROM public.admissions a
    JOIN public.beds b ON b.id = a.bed_id
    JOIN public.wards w ON w.id = b.ward_id
   WHERE a.tenant_id = p_tenant
     AND a.admitted_at >= now() - interval '28 days'
     AND (p_branch IS NULL OR w.branch_id = p_branch);

  -- Current census with projected discharge date.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'admission_id', a.id,
           'patient_id', a.patient_id,
           'ward_type', w.ward_type,
           'ward_name', w.name,
           'bed_number', b.bed_number,
           'admitted_at', a.admitted_at,
           'days_elapsed', GREATEST(0, EXTRACT(EPOCH FROM (now() - a.admitted_at)) / 86400.0)::numeric(6,1),
           'projected_discharge',
             CASE
               WHEN (v_los->>w.ward_type) IS NOT NULL
               THEN (a.admitted_at +
                     make_interval(secs => ((v_los->>w.ward_type)::numeric) * 86400))::date
               ELSE NULL
             END
         ) ORDER BY a.admitted_at), '[]'::jsonb)
    INTO v_active
    FROM public.admissions a
    JOIN public.beds b ON b.id = a.bed_id
    JOIN public.wards w ON w.id = b.ward_id
   WHERE a.tenant_id = p_tenant
     AND a.status IN ('admitted','transferred')
     AND (p_branch IS NULL OR w.branch_id = p_branch);

  -- 7-day horizon: separated active remainders (no projected discharge) +
  -- expected new admissions.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'date', to_char(day, 'YYYY-MM-DD'),
           'projected_active',
           (SELECT COUNT(*) FROM public.admissions a
             JOIN public.beds b ON b.id = a.bed_id
             JOIN public.wards w ON w.id = b.ward_id
            WHERE a.tenant_id = p_tenant
              AND a.status IN ('admitted','transferred')
              AND (p_branch IS NULL OR w.branch_id = p_branch)
              AND (
                (v_los->>w.ward_type) IS NULL
                OR a.admitted_at + make_interval(secs => ((v_los->>w.ward_type)::numeric) * 86400) > day
              ))::integer,
           'expected_new', ROUND(v_rate, 1)
         ) ORDER BY day), '[]'::jsonb)
    INTO v_occ
    FROM generate_series(CURRENT_DATE, CURRENT_DATE + 6, interval '1 day') day;

  RETURN jsonb_build_object(
    'as_of', now(),
    'avg_los_by_ward_type', v_los,
    'admit_rate_28d', ROUND(v_rate, 2),
    'active', v_active,
    'occupancy_forecast', v_occ);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ward_forecast(uuid, uuid) TO authenticated;

COMMIT;
