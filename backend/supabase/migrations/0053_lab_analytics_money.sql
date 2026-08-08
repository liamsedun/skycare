-- ============================================================================
-- 0053 — LAB ANALYTICS: revenue fallback for invoices stored without
-- total_price (some legacy invoice_items have NULL totals) and unit price
-- COALESCE(total_price, quantity * unit_price).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lab_income_report(
  p_tenant uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_branch uuid DEFAULT NULL)
RETURNS TABLE(service_id uuid, service_name text, category text,
              qty bigint, billed numeric, paid numeric)
LANGUAGE sql STABLE AS $fn$
  SELECT ls.id, ls.name, ls.type,
         COUNT(*)::bigint AS qty,
         COALESCE(SUM(COALESCE(ii.total_price, ii.quantity * ii.unit_price)), 0)::numeric(14,2) AS billed,
         COALESCE(SUM(COALESCE(ii.total_price, ii.quantity * ii.unit_price) *
                 i.paid_amount / NULLIF(i.total_amount, 0)), 0)::numeric(14,2) AS paid
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant
      AND i.status NOT IN ('cancelled')
      AND (p_branch IS NULL OR i.branch_id = p_branch)
      AND (p_from IS NULL OR i.issue_date >= p_from)
      AND (p_to   IS NULL OR i.issue_date <= p_to)
    JOIN lab_services ls ON ls.tenant_id = i.tenant_id
      AND ii.description ILIKE '%' || ls.name || '%'
   GROUP BY ls.id, ls.name, ls.type
   ORDER BY billed DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.lab_income_report(uuid, date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.lab_analytics_dashboard(
  p_tenant uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL,
  p_branch uuid DEFAULT NULL, p_months integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  w_from date := COALESCE(p_from, (date_trunc('month', CURRENT_DATE)::date - (p_months - 1) * interval '1 month')::date);
  w_to   date := COALESCE(p_to, CURRENT_DATE);
  v_top  jsonb;
  v_mon  jsonb;
  v_kpi  jsonb;
  v_req  jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'service_name', r.service_name, 'category', r.category,
              'qty', r.qty, 'billed', r.billed, 'paid', r.paid)
             ORDER BY r.billed DESC), '[]'::jsonb)
    INTO v_top
    FROM public.lab_income_report(p_tenant, w_from, w_to, p_branch) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'month', s.month,
              'income', s.income,
              'paid', s.paid,
              'invoices', s.invoices,
              'patients', s.patients,
              'items', s.items) ORDER BY s.month), '[]'::jsonb)
    INTO v_mon
    FROM (
      SELECT to_char(mo, 'YYYY-MM') AS month,
             COALESCE(SUM(COALESCE(tx.total_price, tx.quantity * tx.unit_price)), 0)::numeric(14,2) AS income,
             COALESCE(SUM(COALESCE(tx.total_price, tx.quantity * tx.unit_price) *
                     tx.paid_amount / NULLIF(tx.total_amount, 0)), 0)::numeric(14,2) AS paid,
             COUNT(DISTINCT tx.invoice_id)::bigint AS invoices,
             COUNT(DISTINCT tx.patient_id)::bigint AS patients,
             COUNT(*)::bigint AS items
        FROM generate_series(w_from, w_to, interval '1 month') mo
        LEFT JOIN LATERAL (
          SELECT ii.invoice_id, ii.total_price, ii.quantity, ii.unit_price,
                 i.paid_amount, i.total_amount, i.patient_id
            FROM invoice_items ii
            JOIN invoices i ON i.id = ii.invoice_id
              AND i.tenant_id = p_tenant
              AND i.status NOT IN ('cancelled')
              AND i.issue_date >= mo
              AND i.issue_date < mo + interval '1 month'
              AND (p_branch IS NULL OR i.branch_id = p_branch)
            JOIN lab_services ls ON ls.tenant_id = i.tenant_id
              AND ii.description ILIKE '%' || ls.name || '%'
        ) tx ON true
       GROUP BY 1
    ) s;

  SELECT jsonb_build_object(
           'income', COALESCE(SUM((m->>'income')::numeric), 0),
           'paid', COALESCE(SUM((m->>'paid')::numeric), 0),
           'invoices', COALESCE(SUM((m->>'invoices')::bigint), 0),
           'patients', COALESCE(SUM((m->>'patients')::bigint), 0),
           'items', COALESCE(SUM((m->>'items')::bigint), 0))
    INTO v_kpi
    FROM jsonb_array_elements(v_mon) m;

  SELECT jsonb_build_object(
           'total', COUNT(*),
           'requested', COUNT(*) FILTER (WHERE status = 'requested'),
           'sample_collected', COUNT(*) FILTER (WHERE status = 'sample_collected'),
           'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
           'completed', COUNT(*) FILTER (WHERE status = 'completed'),
           'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'))
    INTO v_req
    FROM public.lab_requests
   WHERE tenant_id = p_tenant
     AND (p_branch IS NULL OR branch_id = p_branch)
     AND requested_at >= w_from::timestamp
     AND requested_at < (w_to + 1)::timestamp;

  RETURN jsonb_build_object(
    'as_of', now(),
    'kpi', v_kpi,
    'monthly', COALESCE(v_mon, '[]'::jsonb),
    'top_services', v_top,
    'requests', v_req);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.lab_analytics_dashboard(uuid, date, date, uuid, integer) TO authenticated;

COMMIT;