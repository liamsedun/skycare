-- ============================================================================
-- 0046 — AI ENGINE FIX #3: NULL-safe anomaly descriptions
-- Claims with NULL patient_id/provider would build a NULL alert message and
-- violate the NOT NULL constraint on pharmacy_compliance_alerts.message.
-- COALESCE guards on all 5b/5c/5d description building.
-- ============================================================================

BEGIN;

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
    description := COALESCE(v_r.name, 'drug') || ' dispensed ' ||
                   COALESCE(v_r.actual, 0) ||
                   ' unit(s) in ' || p_days || ' day(s) vs ' ||
                   COALESCE(round(v_r.mean_daily * p_days, 1), 0) ||
                   ' expected (28-day mean ' ||
                   COALESCE(round(v_r.mean_daily, 2), 0) || '/day, x' ||
                   COALESCE(round(v_rat, 1), 0) || ').';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, v_r.drug_id,
      'Dispensing spike', description);
    PERFORM public.fn_ai_log(
      p_tenant, 'anomaly', v_r.drug_id,
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
    severity      := CASE WHEN v_r.unit_price > 5 * v_r.avg_price
                          THEN 'critical' ELSE 'warning' END;
    drug_id     := v_r.drug_id;
    patient_id  := NULL;
    entity_id   := v_r.invoice_id::text;
    description := COALESCE(v_r.name, 'drug') || ' billed at ' ||
                   COALESCE(v_r.unit_price, 0) || ' vs 90-day avg ' ||
                   COALESCE(round(v_r.avg_price, 2), 0) || ' (invoice ' ||
                   COALESCE(v_r.invoice_id::text, '?') || ').';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, v_r.drug_id,
      'Price anomaly', description);
    PERFORM public.fn_ai_log(
      p_tenant, 'anomaly', v_r.drug_id,
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
    severity      := CASE WHEN v_r.c >= 3 THEN 'critical' ELSE 'warning' END;
    drug_id     := NULL;
    patient_id  := v_r.patient_id::text;
    entity_id   := COALESCE(v_r.patient_id::text, '?') || '|' ||
                   COALESCE(v_r.provider_name, '?') || '|' ||
                   COALESCE(v_r.claim_amount::text, '?');
    description := 'Patient ' || COALESCE(v_r.patient_id::text, 'unknown') ||
                   ' submitted ' || COALESCE(v_r.c, 0) ||
                   ' identical claim(s) (' || COALESCE(v_r.provider_name, '?') ||
                   ', ' || COALESCE(v_r.claim_amount, 0) || ') in ' ||
                   p_days || ' day(s).';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, NULL, 'Duplicate claim', description);
    PERFORM public.fn_ai_log(
      p_tenant, 'anomaly', NULL,
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
    severity      := 'warning';
    drug_id     := NULL;
    patient_id  := v_r.patient_id::text;
    entity_id   := COALESCE(v_r.patient_id::text, '?');
    description := 'Patient ' || COALESCE(v_r.patient_id::text, 'unknown') ||
                   ' filed ' || COALESCE(v_r.c, 0) ||
                   ' claims in 7 days (frequency threshold).';
    PERFORM public.fn_raise_compliance_alert(
      p_tenant, anomaly_type, severity, NULL, 'Claim frequency', description);
    PERFORM public.fn_ai_log(
      p_tenant, 'anomaly', NULL,
      jsonb_build_object('rule', 'claim_frequency', 'patient_id', v_r.patient_id,
                         'claims_7d', v_r.c),
      jsonb_build_object('anomaly_type', 'CLAIM_ANOMALY', 'severity', severity),
      'system', NULL);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$fn$;

COMMIT;