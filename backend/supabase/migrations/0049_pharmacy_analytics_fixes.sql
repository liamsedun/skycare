-- ============================================================================
-- 0049 — ANALYTICS ENGINE FIXES (post-E2E)
--  * dispensing_audit_logs.action CHECK now accepts 'loss' (write-offs were
--    rejected; movement-level audit is a compliance requirement)
--  * pharmacy_analytics_dashboard: jsonb_agg was sorting a RECORD with ->>
--    ('operator does not exist: record ->> unknown'); aggregate the jsonb
--    column instead of the composite row.
-- ============================================================================

BEGIN;

ALTER TABLE public.dispensing_audit_logs DROP CONSTRAINT IF EXISTS dispensing_audit_logs_action_check;
ALTER TABLE public.dispensing_audit_logs ADD CONSTRAINT dispensing_audit_logs_action_check
  CHECK (action = ANY (ARRAY['dispense','in','adjust','cancel','loss']));

CREATE OR REPLACE FUNCTION public.pharmacy_analytics_dashboard(
  p_tenant_id uuid, p_months integer DEFAULT 12, p_branch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_top  jsonb;
  v_mon  jsonb;
  v_ws   jsonb;
  v_kpi  jsonb;
BEGIN
  SELECT jsonb_agg(t.j ORDER BY (t.j->>'revenue')::numeric DESC NULLS LAST)
    INTO v_top
    FROM (SELECT jsonb_build_object(
                 'drug_id', ii.drug_id, 'drug_name', d.name, 'category', d.category,
                 'qty', SUM(ii.quantity), 'revenue', SUM(ii.total_price)::numeric(14,2)) AS j
            FROM public.pharmacy_invoice_items ii
            JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
            JOIN public.pharmacy_drugs d ON d.id = ii.drug_id
           WHERE i.tenant_id = p_tenant_id
             AND i.status NOT IN ('cancelled','refunded')
             AND (p_branch IS NULL OR i.branch_id = p_branch)
             AND i.created_at >= date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval
           GROUP BY ii.drug_id, d.name, d.category) t;
  v_top := COALESCE(v_top, '[]'::jsonb);

  SELECT jsonb_agg(jsonb_build_object(
              'month', m.month, 'revenue', m.revenue, 'cost', m.cost,
              'profit', m.profit, 'invoice_count', m.invoice_count,
              'cash', m.cash, 'pos', m.pos, 'transfer', m.transfer,
              'card', m.card, 'insurance', m.insurance, 'refunds', m.refunds))
    INTO v_mon
  FROM public.pharmacy_monthly_financials(p_tenant_id, p_months, p_branch) m;
  v_mon := COALESCE(v_mon, '[]'::jsonb);

  SELECT jsonb_agg(jsonb_build_object(
              'drug_name', d.name, 'reason', l.reason, 'qty', l.quantity,
              'cost_impact', l.cost_impact, 'recorded_at', l.recorded_at))
    INTO v_ws
  FROM public.inventory_losses l
  JOIN public.pharmacy_drugs d ON d.id = l.drug_id
 WHERE l.tenant_id = p_tenant_id
   AND (p_branch IS NULL OR l.branch_id = p_branch)
   AND l.recorded_at >= date_trunc('month', CURRENT_DATE) - interval '11 months';
  v_ws := COALESCE(v_ws, '[]'::jsonb);

  v_kpi := (SELECT jsonb_build_object(
              'total_revenue', COALESCE(SUM(i.total_amount) FILTER (WHERE i.status NOT IN ('cancelled','refunded')), 0),
              'total_invoices', COUNT(*) FILTER (WHERE i.status NOT IN ('cancelled','refunded')),
              'cancelled', COUNT(*) FILTER (WHERE i.status IN ('cancelled','refunded')))
             FROM public.pharmacy_invoices i
            WHERE i.tenant_id = p_tenant_id
              AND (p_branch IS NULL OR i.branch_id = p_branch));

  RETURN jsonb_build_object(
    'as_of', now(),
    'kpi', v_kpi,
    'top_drugs', v_top,
    'monthly', jsonb_build_object('months', v_mon),
    'wastage_now', v_ws,
    'total_wastage_value', (SELECT COALESCE(SUM(l.cost_impact), 0)
                             FROM public.inventory_losses l
                            WHERE l.tenant_id = p_tenant_id
                              AND (p_branch IS NULL OR l.branch_id = p_branch)));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_analytics_dashboard(uuid, integer, uuid) TO authenticated;

COMMIT;