-- ============================================================================
-- 0063 — USERS & ROLES MODULE ACCESS + PHARMACY DASHBOARD DATE RANGE
--  1. users.module_access text[] — per-user module allow-list (NULL = role
--     default modules; empty array = only non-gated pages).
--  2. pharmacy_monthly_financials / pharmacy_analytics_dashboard gain optional
--     p_from/p_to date window so the dashboard can drill into a custom period
--     (falls back to trailing p_months when p_from is NULL).
-- ============================================================================

BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS module_access text[];
COMMENT ON COLUMN public.users.module_access IS
  'Per-user module allow-list (nav keys). NULL = role default modules; empty array = only non-gated pages.';

-- ---------------------------------------------------------------------------
-- pharmacy_monthly_financials — optional custom date window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_monthly_financials(
  p_tenant_id uuid, p_months integer DEFAULT 12, p_branch uuid DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (
  month text, revenue numeric(14,2), cost numeric(14,2), profit numeric(14,2),
  invoice_count bigint, items_sold bigint,
  cash numeric(14,2), pos numeric(14,2), transfer numeric(14,2),
  card numeric(14,2), insurance numeric(14,2), refunds numeric(14,2)
)
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
    WITH months AS (
      SELECT to_char(generate_series(
               CASE WHEN p_from IS NULL
                    THEN date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval
                    ELSE date_trunc('month', p_from) END,
               CASE WHEN p_from IS NULL
                    THEN date_trunc('month', CURRENT_DATE)
                    ELSE date_trunc('month', p_to) END,
               '1 month'), 'YYYY-MM') AS m
    ),
    sales AS (
      SELECT to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS m,
             i.id AS invoice_id, i.total_amount AS amount, i.status
        FROM public.pharmacy_invoices i
       WHERE i.tenant_id = p_tenant_id
         AND (p_branch IS NULL OR i.branch_id = p_branch)
         AND (p_from IS NULL OR i.created_at::date >= p_from)
         AND (p_to IS NULL OR i.created_at::date <= p_to)
    ),
    item_sum AS (
      SELECT to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS m,
             SUM(ii.quantity) AS qty,
             SUM(ii.total_price) AS rev,
             SUM(ii.quantity * COALESCE(b.cost_price, d.wholesale_price, 0)) AS cst
        FROM public.pharmacy_invoice_items ii
        JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
        JOIN public.pharmacy_drugs d ON d.id = ii.drug_id
        LEFT JOIN public.pharmacy_stock_batches b ON b.id = ii.batch_id
       WHERE i.tenant_id = p_tenant_id
         AND i.status NOT IN ('cancelled','refunded')
         AND (p_branch IS NULL OR i.branch_id = p_branch)
         AND (p_from IS NULL OR i.created_at::date >= p_from)
         AND (p_to IS NULL OR i.created_at::date <= p_to)
       GROUP BY 1
    ),
    pays AS (
      SELECT to_char(p.received_at AT TIME ZONE 'UTC', 'YYYY-MM') AS m,
             p.method::text AS method, p.amount
        FROM public.pharmacy_payments p
       WHERE p.tenant_id = p_tenant_id AND p.status = 'completed'
         AND (p_branch IS NULL OR p.branch_id = p_branch)
         AND (p_from IS NULL OR p.received_at::date >= p_from)
         AND (p_to IS NULL OR p.received_at::date <= p_to)
    )
    SELECT mo.m,
           COALESCE(it.rev, 0)::numeric(14,2),
           COALESCE(it.cst, 0)::numeric(14,2),
           (COALESCE(it.rev, 0) - COALESCE(it.cst, 0))::numeric(14,2),
           (SELECT COUNT(*) FROM sales s WHERE s.m = mo.m
              AND s.status NOT IN ('cancelled','refunded')),
           COALESCE(it.qty, 0),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'cash'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'pos'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'transfer'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'card'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(p.amount) FROM pays p WHERE p.m = mo.m AND p.method = 'insurance'), 0)::numeric(14,2),
           COALESCE((SELECT SUM(s.amount_total) FROM (SELECT i2.total_amount AS amount_total
                        FROM public.pharmacy_invoices i2
                       WHERE i2.tenant_id = p_tenant_id AND i2.status = 'refunded'
                         AND to_char(i2.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = mo.m
                         AND (p_branch IS NULL OR i2.branch_id = p_branch)
                         AND (p_from IS NULL OR i2.created_at::date >= p_from)
                         AND (p_to IS NULL OR i2.created_at::date <= p_to)) s), 0)::numeric(14,2)
      FROM months mo
      LEFT JOIN item_sum it ON it.m = mo.m
     ORDER BY mo.m;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_monthly_financials(uuid, integer, uuid, date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- pharmacy_analytics_dashboard — optional custom date window
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_analytics_dashboard(
  p_tenant_id uuid, p_months integer DEFAULT 12, p_branch uuid DEFAULT NULL,
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
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
             AND (p_from IS NOT NULL OR i.created_at >= date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval)
             AND (p_from IS NULL OR i.created_at::date >= p_from)
             AND (p_to IS NULL OR i.created_at::date <= p_to)
           GROUP BY ii.drug_id, d.name, d.category) t;
  v_top := COALESCE(v_top, '[]'::jsonb);

  SELECT jsonb_agg(jsonb_build_object(
              'month', m.month, 'revenue', m.revenue, 'cost', m.cost,
              'profit', m.profit, 'invoice_count', m.invoice_count,
              'cash', m.cash, 'pos', m.pos, 'transfer', m.transfer,
              'card', m.card, 'insurance', m.insurance, 'refunds', m.refunds))
    INTO v_mon
  FROM public.pharmacy_monthly_financials(p_tenant_id, p_months, p_branch, p_from, p_to) m;
  v_mon := COALESCE(v_mon, '[]'::jsonb);

  SELECT jsonb_agg(jsonb_build_object(
              'drug_name', d.name, 'reason', l.reason, 'qty', l.quantity,
              'cost_impact', l.cost_impact, 'recorded_at', l.recorded_at))
    INTO v_ws
  FROM public.inventory_losses l
  JOIN public.pharmacy_drugs d ON d.id = l.drug_id
 WHERE l.tenant_id = p_tenant_id
   AND (p_branch IS NULL OR l.branch_id = p_branch)
   AND (p_from IS NOT NULL OR l.recorded_at >= date_trunc('month', CURRENT_DATE) - interval '11 months')
   AND (p_from IS NULL OR l.recorded_at::date >= p_from)
   AND (p_to IS NULL OR l.recorded_at::date <= p_to);
  v_ws := COALESCE(v_ws, '[]'::jsonb);

  v_kpi := (SELECT jsonb_build_object(
              'total_revenue', COALESCE(SUM(i.total_amount) FILTER (WHERE i.status NOT IN ('cancelled','refunded')), 0),
              'total_invoices', COUNT(*) FILTER (WHERE i.status NOT IN ('cancelled','refunded')),
              'cancelled', COUNT(*) FILTER (WHERE i.status IN ('cancelled','refunded')))
             FROM public.pharmacy_invoices i
            WHERE i.tenant_id = p_tenant_id
              AND (p_branch IS NULL OR i.branch_id = p_branch)
              AND (p_from IS NULL OR i.created_at::date >= p_from)
              AND (p_to IS NULL OR i.created_at::date <= p_to));

  RETURN jsonb_build_object(
    'as_of', now(),
    'kpi', v_kpi,
    'top_drugs', v_top,
    'monthly', jsonb_build_object('months', v_mon),
    'wastage_now', v_ws,
    'total_wastage_value', (SELECT COALESCE(SUM(l.cost_impact), 0)
                             FROM public.inventory_losses l
                            WHERE l.tenant_id = p_tenant_id
                              AND (p_branch IS NULL OR l.branch_id = p_branch)
                              AND (p_from IS NULL OR l.recorded_at::date >= p_from)
                              AND (p_to IS NULL OR l.recorded_at::date <= p_to)));
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pharmacy_analytics_dashboard(uuid, integer, uuid, date, date) TO authenticated;

COMMIT;
