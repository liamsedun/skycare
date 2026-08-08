-- ============================================================================
-- 0044 — AI ENGINE FIXES: qualified column references
-- Fixes 42702: "column reference could refer to either a PL/pgSQL variable or
-- a table column" — output params (drug_id/patient_id/supplier_id...) of the
-- 0043 functions collided with unqualified column names inside CTEs/subqueries.
-- All functions are fully re-defined with aliased, qualified references only.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 4. DEMAND FORECAST ENGINE (fix: qualified refs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_forecast_run(
  p_tenant uuid, p_drug uuid DEFAULT NULL)
RETURNS TABLE (
  drug_id uuid, drug_name text, daily_rate numeric, trend_factor numeric,
  seasonal_factor numeric,
  predicted_30d integer, predicted_90d integer,
  confidence text, sample_days integer, on_hand integer, stockout_days integer,
  suggested_reorder integer, lead_time_days integer, skipped boolean, reason text
)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_r       record;
  v_days    integer;
  v_last28  numeric;
  v_last7   numeric;
  v_prev7   numeric;
  v_rate    numeric;
  v_trend   numeric := 1;
  v_mean    numeric;
  v_sd      numeric;
  v_cv      numeric := 1;
  v_conf    text;
  v_sea     numeric := 1;
  v_factor  numeric;
  v_day     date;
  v_lead    integer;
  v_on_hand integer;
  v_out     integer;
  v_reorder integer;
  v_i       integer;
BEGIN
  CREATE TEMP TABLE tmp_ai_usage ON COMMIT DROP AS
    SELECT u.drug_id, (u.created_at AT TIME ZONE 'UTC')::date AS d,
           SUM(u.quantity)::numeric AS qty
      FROM public.pharmacy_stock_movements u
     WHERE u.tenant_id = p_tenant
       AND (p_drug IS NULL OR u.drug_id = p_drug)
       AND u.type IN ('dispense','transfer_out')
       AND u.created_at >= now() - interval '13 months'
     GROUP BY u.drug_id, d;

  CREATE TEMP TABLE tmp_ai_drugs ON COMMIT DROP AS
    SELECT d.id AS drug_id, d.name, d.reorder_qty,
           COALESCE(s.lead_time_days, 10)::integer AS lead_days
      FROM public.pharmacy_drugs d
      LEFT JOIN LATERAL (
        SELECT sdp.lead_time_days
          FROM public.supplier_drug_prices sdp
          JOIN public.pharmacy_suppliers s
            ON s.id = sdp.supplier_id
         WHERE sdp.drug_id = d.id AND sdp.tenant_id = d.tenant_id AND s.is_active
         ORDER BY sdp.is_preferred DESC, sdp.unit_cost ASC
         LIMIT 1
      ) s ON true
     WHERE d.tenant_id = p_tenant AND d.is_active
       AND (p_drug IS NULL OR d.id = p_drug);

  CREATE TEMP TABLE tmp_ai_month_f ON COMMIT DROP AS
    WITH mo AS (
      SELECT u.drug_id, to_char(u.d, 'YYYY-MM') AS ym, SUM(u.qty) AS tq
        FROM tmp_ai_usage u
       GROUP BY u.drug_id, ym
    ), av AS (
      SELECT m.drug_id, AVG(m.tq) AS mean FROM mo m GROUP BY m.drug_id
    )
    SELECT mo.drug_id AS drug_id, mo.ym AS ym,
           CASE WHEN av.mean > 0 THEN mo.tq / av.mean ELSE 1 END AS factor
      FROM mo
      JOIN av ON av.drug_id = mo.drug_id;

  FOR v_r IN SELECT * FROM tmp_ai_drugs ORDER BY name LOOP
    skipped := false;
    reason := NULL;
    drug_name := v_r.name;

    SELECT COUNT(*) INTO v_days
      FROM tmp_ai_usage u WHERE u.drug_id = v_r.drug_id;
    IF v_days < 14 THEN
      skipped := true;
      reason := 'insufficient history (< 14 activity days)';
      drug_id := v_r.drug_id;
      sample_days := v_days;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(u.qty), 0) INTO v_last28
      FROM tmp_ai_usage u
     WHERE u.drug_id = v_r.drug_id AND u.d >= CURRENT_DATE - 27;
    v_rate := v_last28 / 28.0;
    IF v_rate <= 0 THEN
      skipped := true;
      reason := 'no dispense activity in the trailing 28 days';
      drug_id := v_r.drug_id;
      sample_days := v_days;
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(u.qty), 0) INTO v_last7
      FROM tmp_ai_usage u WHERE u.drug_id = v_r.drug_id AND u.d >= CURRENT_DATE - 6;
    SELECT COALESCE(SUM(u.qty), 0) INTO v_prev7
      FROM tmp_ai_usage u
     WHERE u.drug_id = v_r.drug_id AND u.d BETWEEN CURRENT_DATE - 13 AND CURRENT_DATE - 7;
    IF v_prev7 > 0 THEN
      v_trend := LEAST(2.0, GREATEST(0.5, v_last7 / v_prev7));
    ELSE
      v_trend := 1;
    END IF;

    SELECT COALESCE(AVG(t.qty), 0), COALESCE(STDDEV(t.qty), 0) INTO v_mean, v_sd
      FROM (SELECT u.qty FROM tmp_ai_usage u
             WHERE u.drug_id = v_r.drug_id AND u.qty > 0 AND u.d >= CURRENT_DATE - 90) t;
    v_cv := v_sd / GREATEST(v_mean, 0.05);
    v_conf := CASE WHEN v_days >= 45 AND v_cv <= 0.55 THEN 'high'
                   WHEN v_days >= 28 THEN 'medium'
                   ELSE 'low' END;

    -- seasonal factor over the next 30 calendar days
    v_sea := 0;
    v_day := CURRENT_DATE;
    FOR v_i IN 0..29 LOOP
      SELECT f.factor INTO v_factor
        FROM tmp_ai_month_f f
       WHERE f.drug_id = v_r.drug_id AND f.ym = to_char(v_day, 'YYYY-MM');
      IF v_factor IS NULL THEN v_factor := 1; END IF;
      v_sea := v_sea + v_factor;
      v_day := v_day + 1;
    END LOOP;
    v_sea := LEAST(2.5, GREATEST(0.3, v_sea / 30.0));

    SELECT COUNT(*) INTO v_i FROM tmp_ai_usage u WHERE u.drug_id = v_r.drug_id;
    predicted_30d := GREATEST(1, ROUND(v_rate * v_trend * v_sea * 30)::int);
    predicted_90d := GREATEST(1, ROUND(v_rate * v_trend * v_sea * 90)::int);

    SELECT COALESCE(SUM(b.quantity_on_hand), 0) INTO v_on_hand
      FROM public.pharmacy_stock_batches b
     WHERE b.drug_id = v_r.drug_id
       AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE);
    IF v_rate * v_trend > 0 THEN
      v_out := GREATEST(0, CEIL(v_on_hand / (v_rate * v_trend))::int);
    ELSE
      v_out := NULL;
    END IF;

    v_lead := v_r.lead_days;
    v_reorder := GREATEST(0, CEIL(predicted_30d * (1 + v_lead / 30.0) * 1.15)::int - v_on_hand);

    INSERT INTO public.pharmacy_forecasts
      (tenant_id, drug_id, horizon, model, predicted_qty, daily_rate, seasonal_factor,
       trend_factor, confidence, sample_days, cv, on_hand, stockout_in_days,
       suggested_reorder, forecast_json, predicted_at)
    VALUES (p_tenant, v_r.drug_id, 30, 'seasonal-ema', predicted_30d,
            ROUND(v_rate, 2), ROUND(v_sea, 3), ROUND(v_trend, 3), v_conf, v_days,
            ROUND(v_cv, 4), v_on_hand, v_out, v_reorder,
            jsonb_build_object('predicted_90d', predicted_90d, 'lead_days', v_lead,
                               'cv', ROUND(v_cv, 4), 'reason', NULL),
            now())
    ON CONFLICT (tenant_id, drug_id, horizon) DO UPDATE SET
      model = EXCLUDED.model, predicted_qty = EXCLUDED.predicted_qty,
      daily_rate = EXCLUDED.daily_rate, seasonal_factor = EXCLUDED.seasonal_factor,
      trend_factor = EXCLUDED.trend_factor, confidence = EXCLUDED.confidence,
      sample_days = EXCLUDED.sample_days, cv = EXCLUDED.cv,
      on_hand = EXCLUDED.on_hand, stockout_in_days = EXCLUDED.stockout_in_days,
      suggested_reorder = EXCLUDED.suggested_reorder,
      forecast_json = EXCLUDED.forecast_json, predicted_at = now();

    -- STOCKOUT_RISK alert (lead-time window)
    IF v_out IS NOT NULL AND v_out <= v_lead + 3 THEN
      PERFORM public.fn_raise_compliance_alert(
        p_tenant, 'STOCKOUT_RISK',
        CASE WHEN v_out <= 3 THEN 'critical' ELSE 'warning' END,
        v_r.drug_id, 'Stock-out risk',
        v_r.name || ' is projected to run out in ~' || v_out ||
        ' days (lead ' || v_lead || 'd). Predicted 30d demand ' || predicted_30d ||
        ' -> suggested order ' || v_reorder || ' units.');
    END IF;

    -- SLOW_MOVER: on-hand would last > 90 days while item is stocked
    IF v_out IS NOT NULL AND v_out > 90 THEN
      PERFORM public.fn_raise_compliance_alert(
        p_tenant, 'SLOW_MOVER', 'info', v_r.drug_id,
        'Slow-moving drug',
        v_r.name || ' holds ~' || v_on_hand || ' units (~' || v_out ||
        ' days cover, pred demand ' || predicted_30d || '/30d).');
    END IF;

    INSERT INTO public.pharmacy_ai_decisions
      (tenant_id, decision, drug_id, input_summary, output, confidence, created_by)
    VALUES (p_tenant, 'forecast', v_r.drug_id,
            jsonb_build_object('on_hand', v_on_hand, 'sample_days', v_days,
                               'rate_28d', ROUND(v_rate, 2), 'lead_days', v_lead),
            jsonb_build_object('predicted_30d', predicted_30d, 'predicted_90d', predicted_90d,
                               'seasonal', v_sea, 'trend', v_trend, 'cv', ROUND(v_cv, 4),
                               'stockout_days', v_out, 'suggested_reorder', v_reorder),
            v_conf, NULL);

    drug_id := v_r.drug_id;
    daily_rate := ROUND(v_rate, 2);
    trend_factor := v_trend;
    seasonal_factor := v_sea;
    confidence := v_conf;
    sample_days := v_days;
    on_hand := v_on_hand;
    stockout_days := v_out;
    suggested_reorder := v_reorder;
    lead_time_days := v_lead;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. ANOMALY ENGINE (fix: qualified refs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_anomaly_scan(
  p_tenant uuid, p_days integer DEFAULT 1)
RETURNS TABLE (
  anomaly_type text, severity text, drug_id uuid, patient_id text,
  entity_id text, description text
)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_r   record;
  v_rat numeric;
BEGIN
  IF p_days < 1 OR p_days > 31 THEN p_days := 1; END IF;

  -- 5a. Dispensing spike: window qty > 3x the 28-day daily mean * days.
  FOR v_r IN
    WITH w AS (
      SELECT sm.drug_id, SUM(sm.quantity) AS actual
        FROM public.pharmacy_stock_movements sm
       WHERE sm.tenant_id = p_tenant
         AND sm.type IN ('dispense','transfer_out')
         AND sm.created_at >= now() - ((p_days || ' days')::interval)
       GROUP BY sm.drug_id
    ), base AS (
      SELECT sm.drug_id, SUM(sm.quantity) / 28.0 AS mean_daily
        FROM public.pharmacy_stock_movements sm
       WHERE sm.tenant_id = p_tenant
         AND sm.type IN ('dispense','transfer_out')
         AND sm.created_at >= now() - interval '28 days'
       GROUP BY sm.drug_id
    )
    SELECT w.drug_id, d.name, w.actual, COALESCE(b.mean_daily, 0) AS mean_daily
      FROM w
      JOIN public.pharmacy_drugs d
        ON d.id = w.drug_id AND d.tenant_id = p_tenant
      LEFT JOIN base b ON b.drug_id = w.drug_id
     WHERE COALESCE(b.mean_daily, 0) * p_days >= 2
       AND w.actual > 3 * COALESCE(b.mean_daily, 0) * p_days
  LOOP
    v_rat := v_r.actual / GREATEST(v_r.mean_daily * p_days, 0.0001);
    anomaly_type := 'DISPENSE_ANOMALY';
    severity    := CASE WHEN v_rat >= 5 THEN 'critical' ELSE 'warning' END;
    drug_id     := v_r.drug_id;
    patient_id  := NULL;
    entity_id   := v_r.drug_id::text;
    description := v_r.name || ' dispensed ' || v_r.actual ||
                   ' unit(s) in ' || p_days || ' day(s) vs ' ||
                   round(v_r.mean_daily * p_days, 1) || ' expected (28-day mean ' ||
                   round(v_r.mean_daily, 2) || '/day, x' ||
                   round(v_rat, 1) || ').';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, v_r.drug_id,
      'Dispensing spike', description);
    INSERT INTO public.pharmacy_ai_decisions
      (tenant_id, decision, drug_id, input_summary, output, confidence, created_by)
    VALUES (p_tenant, 'anomaly', v_r.drug_id,
            jsonb_build_object('rule', 'dispense_spike', 'window_days', p_days,
                               'actual', v_r.actual,
                               'expected', round(v_r.mean_daily * p_days, 1)),
            jsonb_build_object('ratio', round(v_rat, 2), 'severity', severity),
            'system', NULL);
    RETURN NEXT;
  END LOOP;

  -- 5b. Billing price outliers: current unit_price > 3x recent 90-day avg.
  FOR v_r IN
    WITH recent AS (
      SELECT ii.drug_id, AVG(ii.unit_price) AS avg_price
        FROM public.pharmacy_invoice_items ii
        JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id
       WHERE i.tenant_id = p_tenant AND i.created_at >= now() - interval '90 days'
       GROUP BY ii.drug_id
    )
    SELECT ii.drug_id, d.name, ii.unit_price, ii.invoice_id,
           COALESCE(r.avg_price, d.unit_price) AS avg_price
      FROM public.pharmacy_invoice_items ii
      JOIN public.pharmacy_invoices i ON i.id = ii.invoice_id AND i.tenant_id = p_tenant
      JOIN public.pharmacy_drugs d ON d.id = ii.drug_id AND d.tenant_id = p_tenant
      LEFT JOIN recent r ON r.drug_id = ii.drug_id
     WHERE i.created_at >= now() - ((p_days || ' days')::interval)
       AND ii.unit_price > 3 * COALESCE(r.avg_price, d.unit_price)
  LOOP
    anomaly_type := 'BILLING_ANOMALY';
    severity    := CASE WHEN v_r.unit_price > 5 * v_r.avg_price
                        THEN 'critical' ELSE 'warning' END;
    drug_id     := v_r.drug_id;
    patient_id  := NULL;
    entity_id   := v_r.invoice_id::text;
    description := v_r.name || ' billed at ' || v_r.unit_price ||
                   ' vs 90-day avg ' || round(v_r.avg_price, 2) ||
                   ' (invoice ' || v_r.invoice_id || ').';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, v_r.drug_id,
      'Price anomaly', description);
    INSERT INTO public.pharmacy_ai_decisions
      (tenant_id, decision, input_summary, output, confidence, created_by)
    VALUES (p_tenant, 'anomaly',
            jsonb_build_object('rule', 'price_outlier', 'invoice_id', v_r.invoice_id,
                               'unit_price', v_r.unit_price,
                               'avg_90d', round(v_r.avg_price, 2)),
            jsonb_build_object('anomaly_type', 'BILLING_ANOMALY',
                               'severity', severity),
            'system', NULL);
    RETURN NEXT;
  END LOOP;

  -- 5c. Claim duplicates: same patient + provider + amount within window.
  FOR v_r IN
    SELECT cl.patient_id, cl.provider_name, cl.claim_amount, COUNT(*) AS c
      FROM public.insurance_claims cl
     WHERE cl.tenant_id = p_tenant
       AND cl.submitted_at >= now() - ((p_days || ' days')::interval)
     GROUP BY cl.patient_id, cl.provider_name, cl.claim_amount
    HAVING COUNT(*) > 1
  LOOP
    anomaly_type := 'CLAIM_ANOMALY';
    severity    := CASE WHEN v_r.c >= 3 THEN 'critical' ELSE 'warning' END;
    drug_id     := NULL;
    patient_id  := v_r.patient_id::text;
    entity_id   := v_r.patient_id::text || '|' || v_r.provider_name ||
                   '|' || v_r.claim_amount;
    description := 'Patient ' || v_r.patient_id || ' submitted ' || v_r.c ||
                   ' identical claim(s) (' || v_r.provider_name || ', ' ||
                   v_r.claim_amount || ') in ' || p_days || ' day(s).';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, NULL, 'Duplicate claim', description);
    INSERT INTO public.pharmacy_ai_decisions
      (tenant_id, decision, input_summary, output, confidence, created_by)
    VALUES (p_tenant, 'anomaly',
            jsonb_build_object('rule', 'claim_duplicate', 'patient_id', v_r.patient_id,
                               'provider', v_r.provider_name, 'amount', v_r.claim_amount,
                               'count', v_r.c),
            jsonb_build_object('anomaly_type', 'CLAIM_ANOMALY', 'severity', severity),
            'system', NULL);
    RETURN NEXT;
  END LOOP;

  -- 5d. Claim frequency: >= 5 submitted claims by one patient in 7 days.
  FOR v_r IN
    SELECT cl.patient_id, COUNT(*) AS c
      FROM public.insurance_claims cl
     WHERE cl.tenant_id = p_tenant AND cl.submitted_at >= now() - interval '7 days'
     GROUP BY cl.patient_id
    HAVING COUNT(*) >= 5
  LOOP
    anomaly_type := 'CLAIM_ANOMALY';
    severity    := 'warning';
    drug_id     := NULL;
    patient_id  := v_r.patient_id::text;
    entity_id   := v_r.patient_id::text;
    description := 'Patient ' || v_r.patient_id || ' filed ' || v_r.c ||
                   ' claims in 7 days (frequency threshold).';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, NULL, 'Claim frequency', description);
    INSERT INTO public.pharmacy_ai_decisions
      (tenant_id, decision, input_summary, output, confidence, created_by)
    VALUES (p_tenant, 'anomaly',
            jsonb_build_object('rule', 'claim_frequency', 'patient_id', v_r.patient_id,
                               'claims_7d', v_r.c),
            jsonb_build_object('anomaly_type', 'CLAIM_ANOMALY', 'severity', severity),
            'system', NULL);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. AUTOMATION (fix: qualified refs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_auto_reorder(
  p_tenant uuid, p_dry_run boolean DEFAULT true, p_created_by uuid DEFAULT NULL)
RETURNS TABLE (
  supplier_id uuid, supplier_name text, drug_id uuid, drug_name text,
  quantity integer, unit_cost numeric, line_total numeric, po_id uuid, note text
)
LANGUAGE plpgsql AS $fn$
DECLARE
  v_sup     record;
  v_item    record;
  v_items   jsonb;
  v_lead    integer := 10;
  v_expected date;
  v_po      uuid;
BEGIN
  CREATE TEMP TABLE tmp_ai_reorder ON COMMIT DROP AS
  WITH latest AS (
    SELECT DISTINCT ON (f.drug_id) f.*
      FROM public.pharmacy_forecasts f
     WHERE f.tenant_id = p_tenant AND f.horizon = 30
     ORDER BY f.drug_id, f.predicted_at DESC
  ), sup AS (
    SELECT l.drug_id, s.id AS supplier_id, s.name AS supplier_name,
           sdp.unit_cost, COALESCE(sdp.lead_time_days, 10) AS lead_days
      FROM latest l
      JOIN public.supplier_drug_prices sdp
        ON sdp.drug_id = l.drug_id AND sdp.tenant_id = p_tenant
      JOIN public.pharmacy_suppliers s ON s.id = sdp.supplier_id AND s.is_active
     WHERE l.suggested_reorder > 0
  ), best AS (
    SELECT DISTINCT ON (sup.drug_id) sup.*
      FROM sup
     ORDER BY sup.drug_id, sup.unit_cost ASC, sup.lead_days ASC
  ), open_d AS (
    SELECT pi.drug_id
      FROM public.pharmacy_purchase_orders po
      JOIN public.pharmacy_purchase_order_items pi ON pi.purchase_order_id = po.id
     WHERE po.tenant_id = p_tenant AND po.status IN ('draft','sent','approved')
  )
  SELECT b.drug_id, d.name AS drug_name, f.suggested_reorder AS quantity,
         b.supplier_id, b.supplier_name, b.unit_cost, b.lead_days
    FROM best b
    JOIN public.pharmacy_drugs d ON d.id = b.drug_id
    JOIN latest f ON f.drug_id = b.drug_id
   WHERE b.drug_id NOT IN (SELECT od.drug_id FROM open_d od)
   ORDER BY b.supplier_id, b.drug_id;

  FOR v_sup IN
    SELECT t.supplier_id, t.supplier_name FROM tmp_ai_reorder t
     GROUP BY t.supplier_id, t.supplier_name ORDER BY t.supplier_id
  LOOP
    SELECT jsonb_agg(jsonb_build_object('drug_id', t.drug_id, 'quantity', t.quantity,
                                        'unit_cost', t.unit_cost, 'notes', t.supplier_name))
      INTO v_items FROM tmp_ai_reorder t WHERE t.supplier_id = v_sup.supplier_id;
    SELECT MAX(t.lead_days) INTO v_lead FROM tmp_ai_reorder t WHERE t.supplier_id = v_sup.supplier_id;
    v_expected := CURRENT_DATE + COALESCE(v_lead, 10);

    v_po := NULL;
    IF NOT p_dry_run THEN
      v_po := public.pharmacy_po_create(
        p_tenant, v_sup.supplier_id, NULL, v_items,
        'Auto-generated by pharmacy_auto_reorder', v_expected, p_created_by);
    END IF;

    FOR v_item IN
      SELECT * FROM tmp_ai_reorder t WHERE t.supplier_id = v_sup.supplier_id ORDER BY t.drug_id
    LOOP
      supplier_id   := v_sup.supplier_id;
      supplier_name := v_sup.supplier_name;
      drug_id       := v_item.drug_id;
      drug_name     := v_item.drug_name;
      quantity      := v_item.quantity;
      unit_cost     := v_item.unit_cost;
      line_total    := round(v_item.quantity * v_item.unit_cost, 2);
      po_id         := v_po;
      note          := CASE WHEN p_dry_run THEN 'dry-run (no PO created)'
                            ELSE 'PO ' || COALESCE(v_po::text, '-') ||
                                 ' (expected ' || v_expected || ')' END;
      INSERT INTO public.pharmacy_ai_decisions
        (tenant_id, decision, drug_id, input_summary, output, confidence, created_by)
      VALUES (p_tenant, 'auto_reorder', v_item.drug_id,
              jsonb_build_object('dry_run', p_dry_run, 'supplier', v_item.supplier_name,
                                 'suggested', v_item.quantity, 'lead_days', v_item.lead_days),
              jsonb_build_object('po_id', v_po, 'quantity', v_item.quantity,
                                 'unit_cost', v_item.unit_cost),
              'high', p_created_by);
      RETURN NEXT;
    END LOOP;
  END LOOP;

  DROP TABLE IF EXISTS tmp_ai_reorder;
  RETURN;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. ACCURACY MATRIX (fix: qualified refs)
-- ---------------------------------------------------------------------------
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
           COALESCE(a.actual_qty, 0),
           ROUND(100 * (1 - ABS(fc.predicted_qty - COALESCE(a.actual_qty, 0)) /
                 GREATEST(fc.predicted_qty, COALESCE(a.actual_qty, 0), 1)), 4),
           fc.model, fc.predicted_at
      FROM public.pharmacy_forecasts fc
      JOIN public.pharmacy_drugs d ON d.id = fc.drug_id AND d.tenant_id = p_tenant
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(m.quantity), 0) AS actual_qty
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

-- ---------------------------------------------------------------------------
-- 8. INSIGHTS (fix: qualified refs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_ai_insights(
  p_tenant uuid, p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_latest   timestamptz;
  v_cov      jsonb;
  v_stock    jsonb;
  v_slow     jsonb;
  v_alerts   jsonb;
  v_acc      numeric;
  v_demand   bigint;
  v_reorder  numeric;
  v_decisions bigint;
BEGIN
  SELECT MAX(f.predicted_at) INTO v_latest
    FROM public.pharmacy_forecasts f
   WHERE f.tenant_id = p_tenant AND f.horizon = 30;

  SELECT jsonb_build_object(
           'modelled', COUNT(*),
           'high',     COUNT(*) FILTER (WHERE f.confidence = 'high'),
           'medium',   COUNT(*) FILTER (WHERE f.confidence = 'medium'),
           'low',      COUNT(*) FILTER (WHERE f.confidence = 'low'),
           'insufficient', COUNT(*) FILTER (WHERE f.confidence = 'insufficient'))
    INTO v_cov
    FROM public.pharmacy_forecasts f
   WHERE f.tenant_id = p_tenant AND f.horizon = 30
     AND f.predicted_at = COALESCE(v_latest, '1900-01-01'::timestamptz);

  v_stock := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'drug_id', f.drug_id, 'name', d.name, 'on_hand', f.on_hand,
             'stockout_in_days', f.stockout_in_days,
             'suggested_reorder', f.suggested_reorder,
             'confidence', f.confidence)
             ORDER BY f.stockout_in_days ASC NULLS LAST)
      FROM public.pharmacy_forecasts f
      JOIN public.pharmacy_drugs d ON d.id = f.drug_id AND d.tenant_id = p_tenant
     WHERE f.tenant_id = p_tenant AND f.horizon = 30
       AND f.predicted_at = v_latest AND f.stockout_in_days IS NOT NULL
       AND f.suggested_reorder > 0
     LIMIT p_limit), '[]'::jsonb);

  v_slow := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'drug_id', f.drug_id, 'name', d.name, 'on_hand', f.on_hand,
             'stockout_in_days', f.stockout_in_days)
             ORDER BY f.stockout_in_days DESC NULLS LAST)
      FROM public.pharmacy_forecasts f
      JOIN public.pharmacy_drugs d ON d.id = f.drug_id AND d.tenant_id = p_tenant
     WHERE f.tenant_id = p_tenant AND f.horizon = 30
       AND f.predicted_at = v_latest AND f.stockout_in_days > 90
     LIMIT p_limit), '[]'::jsonb);

  v_alerts := COALESCE((
    SELECT jsonb_object_agg(t.alert_type, t.c)::jsonb
      FROM (SELECT ca.alert_type, COUNT(*) AS c
              FROM public.pharmacy_compliance_alerts ca
             WHERE ca.tenant_id = p_tenant AND ca.created_at >= now() - interval '7 days'
             GROUP BY ca.alert_type) t), '{}'::jsonb);

  SELECT ROUND(AVG(m.accuracy), 2) INTO v_acc
    FROM public.pharmacy_forecast_matrix(p_tenant, 30, 200) m;

  SELECT SUM(f.predicted_qty) INTO v_demand
    FROM public.pharmacy_forecasts f
   WHERE f.tenant_id = p_tenant AND f.horizon = 30 AND f.predicted_at = v_latest;

  SELECT ROUND(SUM(f.suggested_reorder * s.unit_cost), 2) INTO v_reorder
    FROM public.pharmacy_forecasts f
    JOIN LATERAL (
      SELECT sdp.unit_cost
        FROM public.supplier_drug_prices sdp
        JOIN public.pharmacy_suppliers s ON s.id = sdp.supplier_id AND s.is_active
       WHERE sdp.drug_id = f.drug_id AND sdp.tenant_id = p_tenant
       ORDER BY sdp.is_preferred DESC, sdp.unit_cost ASC
       LIMIT 1) s ON true
   WHERE f.tenant_id = p_tenant AND f.horizon = 30
     AND f.predicted_at = v_latest AND f.suggested_reorder > 0;

  SELECT COUNT(*) INTO v_decisions
    FROM public.pharmacy_ai_decisions ad
   WHERE ad.tenant_id = p_tenant AND ad.created_at >= now() - interval '7 days';

  RETURN jsonb_build_object(
    'as_of', now(), 'last_forecast_at', v_latest,
    'model_coverage', v_cov,
    'stockout_risks', v_stock,
    'slow_movers', v_slow,
    'alerts_7d', v_alerts,
    'accuracy_30d', v_acc,
    'demand_30d', v_demand,
    'reorder_value', v_reorder,
    'ai_decisions_7d', v_decisions);
END;
$fn$;

COMMIT;