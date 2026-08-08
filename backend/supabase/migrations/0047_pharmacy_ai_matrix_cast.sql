-- ============================================================================
-- 0047 — AI ENGINE FIX #4: matrix actual_qty bigint -> integer
-- SUM() yields bigint; the RETURNS TABLE column is integer. Cast at source.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pharmacy_forecast_matrix(
  p_tenant uuid, p_horizon integer DEFAULT 30, p_limit integer DEFAULT 50)
RETURNS TABLE (
  drug_id uuid, drug_name text, horizon integer, predicted_qty integer,
  actual_qty integer, accuracy numeric, model text, predicted_at timestamptz
)
LANGUAGE plpgsql AS $fn$
BEGIN
  RETURN QUERY
    SELECT fc.drug_id, d.name, fc.horizon, fc.predicted_qty,
           COALESCE(a.actual_qty, 0)::int,
           ROUND(100 * (1 - ABS(fc.predicted_qty - COALESCE(a.actual_qty, 0)) /
                 GREATEST(fc.predicted_qty, COALESCE(a.actual_qty, 0), 1)), 4),
           fc.model, fc.predicted_at
      FROM public.pharmacy_forecasts fc
      JOIN public.pharmacy_drugs d ON d.id = fc.drug_id AND d.tenant_id = p_tenant
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(m.quantity), 0)::bigint AS actual_qty
          FROM public.pharmacy_stock_movements m
         WHERE m.tenant_id = p_tenant AND m.drug_id = fc.drug_id
           AND m.type IN ('dispense','transfer_out')
           AND m.created_at >= fc.predicted_at
           AND m.created_at < fc.predicted_at + ((p_horizon || ' days')::interval)
      ) a ON true
     WHERE fc.tenant_id = p_tenant AND fc.horizon = p_horizon
       AND fc.predicted_at <= now() - ((p_horizon || ' days')::interval)
     ORDER BY fc.predicted_at DESC
     LIMIT GREATEST(1, p_limit);
END;
$fn$;

COMMIT;