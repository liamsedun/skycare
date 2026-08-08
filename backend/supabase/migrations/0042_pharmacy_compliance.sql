-- ============================================================================
-- 0042 — NAFDAC COMPLIANCE ENGINE
-- Controlled drug tracking, mandatory control register, tamper-proof dispensing
-- audit logs, regulatory alert engine, and NAFDAC reporting functions.
--
--  1. pharmacy_drugs  : + control_schedule (I-V), + max_qty_per_dispense,
--                       NAFDAC number + schedule enforcement trigger
--  2. controlled_drug_register : append-only drug ledger, running balance,
--                       auto-entered on every controlled movement
--  3. dispensing_audit_logs    : append-only SHA-256 chained audit of EVERY
--                       stock movement (all drugs)
--  4. pharmacy_compliance_alerts : regulatory alert store + sweep + triggers
--  5. Report RPCs     : controlled-usage, expiry, supplier, stock reports
--  6. pharmacy_controlled_dispense RPC with pharmacist-safe enforcement
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Dependency
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. DRUG TABLE — control columns + NAFDAC enforcement
-- ---------------------------------------------------------------------------
ALTER TABLE public.pharmacy_drugs
  ADD COLUMN IF NOT EXISTS control_schedule varchar
    CHECK (control_schedule IN ('Schedule I','Schedule II','Schedule III','Schedule IV','Schedule V')
           OR control_schedule IS NULL),
  ADD COLUMN IF NOT EXISTS max_qty_per_dispense integer
    CHECK (max_qty_per_dispense IS NULL OR max_qty_per_dispense > 0);

COMMENT ON COLUMN public.pharmacy_drugs.control_schedule IS 'NAFDAC schedule I-V for controlled substances';
COMMENT ON COLUMN public.pharmacy_drugs.max_qty_per_dispense IS 'Hard cap on units per single dispensing event';

-- Controlled drugs MUST carry a NAFDAC number + schedule and require Rx.
CREATE OR REPLACE FUNCTION public.fn_pharmacy_enforce_controlled_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_controlled THEN
    IF NEW.control_schedule IS NULL THEN
      RAISE EXCEPTION 'Controlled drug % must declare a control_schedule (I-V)', NEW.name;
    END IF;
    IF COALESCE(btrim(NEW.nafdac_number), '') = '' THEN
      RAISE EXCEPTION 'Controlled drug % requires a NAFDAC registration number', NEW.name;
    END IF;
    NEW.requires_rx := true;
    IF NEW.max_qty_per_dispense IS NULL THEN
      NEW.max_qty_per_dispense := 30;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_enforce_controlled_rules ON public.pharmacy_drugs;
CREATE TRIGGER trg_pharmacy_enforce_controlled_rules
  BEFORE INSERT OR UPDATE ON public.pharmacy_drugs
  FOR EACH ROW EXECUTE FUNCTION public.fn_pharmacy_enforce_controlled_rules();

-- ---------------------------------------------------------------------------
-- 2. CONTROLLED DRUG REGISTER (append-only; corrections = new rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.controlled_drug_register (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id),
  drug_id            uuid NOT NULL REFERENCES public.pharmacy_drugs(id) ON DELETE RESTRICT,
  patient_id         uuid REFERENCES public.patients(id),
  prescription_id    uuid REFERENCES public.prescriptions(id),
  quantity_dispensed integer NOT NULL DEFAULT 0 CHECK (quantity_dispensed >= 0),
  balance_after      integer NOT NULL DEFAULT 0,
  quantity_received  integer NOT NULL DEFAULT 0,
  source_supplier    text,
  prescriber_name    text,
  pharmacist_id      uuid REFERENCES auth.users(id),
  notes              text,
  branch_id          uuid REFERENCES public.branches(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdr_scope ON public.controlled_drug_register (tenant_id, drug_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cdr_prescription ON public.controlled_drug_register (tenant_id, prescription_id);
CREATE INDEX IF NOT EXISTS idx_cdr_patient ON public.controlled_drug_register (tenant_id, patient_id);

CREATE OR REPLACE FUNCTION public.fn_cdr_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'controlled_drug_register is append-only; corrections must be new rows';
END;
$$;

DROP TRIGGER IF EXISTS trg_cdr_immutable ON public.controlled_drug_register;
CREATE TRIGGER trg_cdr_immutable
  BEFORE UPDATE OR DELETE ON public.controlled_drug_register
  FOR EACH ROW EXECUTE FUNCTION public.fn_cdr_immutable();

ALTER TABLE public.controlled_drug_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cdr_staff_read ON public.controlled_drug_register;
CREATE POLICY cdr_staff_read ON public.controlled_drug_register
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() AND u.tenant_id = controlled_drug_register.tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 3. DISPENSING AUDIT LOGS — append-only + SHA-256 hash chain
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispensing_audit_logs (
  id               bigserial PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  user_id          uuid REFERENCES auth.users(id),
  action           text NOT NULL CHECK (action IN ('dispense','in','adjust','cancel')),
  drug_id          uuid NOT NULL REFERENCES public.pharmacy_drugs(id),
  drug_name        text,
  batch_id         uuid,
  branch_id        uuid,
  patient_id       uuid,
  prescription_id  uuid,
  quantity         integer NOT NULL,
  notes            text,
  hash             text,
  prev_hash        text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dal_scope ON public.dispensing_audit_logs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dal_drug ON public.dispensing_audit_logs (drug_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dal_user ON public.dispensing_audit_logs (user_id, created_at);

CREATE OR REPLACE FUNCTION public.fn_dal_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dispensing_audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_dal_immutable ON public.dispensing_audit_logs;
CREATE TRIGGER trg_dal_immutable
  BEFORE UPDATE OR DELETE ON public.dispensing_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_dal_immutable();

ALTER TABLE public.dispensing_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dal_staff_read ON public.dispensing_audit_logs;
CREATE POLICY dal_staff_read ON public.dispensing_audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() AND u.tenant_id = dispensing_audit_logs.tenant_id)
  );

-- Hash chain: hash = sha256(prev_hash | tenant | actor | action | drug | qty
--                           | patient | batch | created_at)
CREATE OR REPLACE FUNCTION public.fn_pharmacy_audit_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev text;
BEGIN
  SELECT hash INTO v_prev FROM public.dispensing_audit_logs ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := v_prev;
  NEW.hash := encode(
    digest(
      COALESCE(v_prev, 'GENESIS') || '|' ||
      NEW.tenant_id::text || '|' || COALESCE(NEW.user_id::text, 'anon') || '|' ||
      NEW.action || '|' || NEW.drug_id::text || '|' || NEW.quantity::text || '|' ||
      COALESCE(NEW.patient_id::text, '') || '|' || COALESCE(NEW.batch_id::text, '') || '|' ||
      COALESCE(now()::text, ''),
      'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_audit_hash ON public.dispensing_audit_logs;
CREATE TRIGGER trg_pharmacy_audit_hash
  BEFORE INSERT ON public.dispensing_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_pharmacy_audit_hash();

-- ---------------------------------------------------------------------------
-- 4. MOVEMENT → REGISTER + AUDIT HOOK
-- After every stock movement: controlled movements update the register with a
-- running balance; EVERY movement appends a chained audit row. Dispensing a
-- controlled drug without a prescription source_ref aborts at the DB boundary
-- (even for service-client writes).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pharmacy_compliance_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_drug        record;
  v_balance     integer;
  v_patient     uuid;
  v_prescriber  text;
  v_rx_id       uuid;
  v_rx_patient  uuid;
  v_remaining   integer;
  v_drug_result record;
  v_qty_check   integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id, name, is_controlled, max_qty_per_dispense
    INTO STRICT v_drug
    FROM public.pharmacy_drugs WHERE id = NEW.drug_id;

-- Resolve prescription context (if a reference is present). Text compare
  -- avoids a hard cast error when source_ref is a non-prescription id.
  IF NEW.type = 'dispense' AND NEW.source_ref IS NOT NULL THEN
    SELECT p.id, p.patient_id, u.full_name
      INTO v_rx_id, v_rx_patient, v_prescriber
      FROM public.prescriptions p
      LEFT JOIN public.users u ON u.id = p.doctor_id
     WHERE p.id::text = NEW.source_ref;
    IF v_rx_id IS NOT NULL THEN
      v_patient := v_rx_patient;
    END IF;
  END IF;

  -- ---- Controlled drug rules --------------------------------------------
  IF v_drug.is_controlled THEN
    -- No dispensing without a prescription (regardless of route)
    IF NEW.type IN ('dispense') AND v_rx_id IS NULL THEN
      RAISE EXCEPTION 'Controlled drug % cannot be dispensed without a prescription (source_ref = prescription id)', v_drug.name;
    END IF;
    -- Enforce the per-dispensing cap (NAFDAC/NDLEA limits)
    IF NEW.type = 'dispense' AND COALESCE(v_drug.max_qty_per_dispense, 0) > 0
       AND NEW.quantity > v_drug.max_qty_per_dispense THEN
      RAISE EXCEPTION 'Dispensing % units of controlled drug % exceeds its cap of %', NEW.quantity, v_drug.name, v_drug.max_qty_per_dispense;
    END IF;

    -- Running balance from the ledger
    SELECT COALESCE(
             (SELECT balance_after FROM public.controlled_drug_register
               WHERE drug_id = NEW.drug_id AND tenant_id = NEW.tenant_id
               ORDER BY created_at DESC, id DESC LIMIT 1), 0)
      INTO v_balance;

    IF NEW.type IN ('in','transfer_in') THEN
      v_balance := v_balance + NEW.quantity;
      INSERT INTO public.controlled_drug_register
        (tenant_id, drug_id, prescription_id, quantity_received, balance_after,
         source_supplier, pharmacist_id, notes, branch_id, created_at)
      VALUES (NEW.tenant_id, NEW.drug_id, NULL, NEW.quantity, v_balance,
              NEW.notes, COALESCE(NEW.created_by, auth.uid()),
              'Received ' || NEW.quantity || ' units', NEW.branch_id, now());
    ELSIF NEW.type IN ('dispense','transfer_out') THEN
      v_balance := GREATEST(v_balance - NEW.quantity, 0);
      INSERT INTO public.controlled_drug_register
        (tenant_id, drug_id, patient_id, prescription_id, quantity_dispensed,
         balance_after, prescriber_name, pharmacist_id, notes, branch_id, created_at)
      VALUES (NEW.tenant_id, NEW.drug_id, v_patient, v_rx_id, NEW.quantity,
              v_balance, v_prescriber, COALESCE(NEW.created_by, auth.uid()),
              'Dispensed ' || NEW.quantity || ' units', NEW.branch_id, now());
    END IF;
  END IF;

  -- ---- Audit row for EVERY movement --------------------------------------
  INSERT INTO public.dispensing_audit_logs
    (tenant_id, user_id, action, drug_id, drug_name, batch_id, branch_id,
     patient_id, prescription_id, quantity, notes, created_at)
  VALUES (NEW.tenant_id, COALESCE(NEW.created_by, auth.uid()),
          CASE WHEN NEW.type IN ('in','transfer_in') THEN 'in'
               WHEN NEW.type = 'adjust' THEN 'adjust'
               ELSE 'dispense' END,
          NEW.drug_id, v_drug.name, NEW.batch_id, NEW.branch_id,
          v_patient, v_rx_id, NEW.quantity, NEW.notes, now());

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_compliance_movement ON public.pharmacy_stock_movements;
CREATE TRIGGER trg_pharmacy_compliance_movement
  AFTER INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_pharmacy_compliance_movement();

-- ---------------------------------------------------------------------------
-- 5. REGULATORY ALERT ENGINE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pharmacy_compliance_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  alert_type  text NOT NULL CHECK (alert_type IN
    ('LOW_CONTROLLED_STOCK','EXPIRY_WARNING','INVALID_REGISTRATION','SUSPICIOUS_DISPENSING')),
  severity    text NOT NULL DEFAULT 'warning'
              CHECK (severity IN ('info','warning','critical')),
  drug_id     uuid REFERENCES public.pharmacy_drugs(id),
  title       text NOT NULL,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','acknowledged','resolved')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_alerts_scope ON public.pharmacy_compliance_alerts (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comp_alerts_type ON public.pharmacy_compliance_alerts (tenant_id, alert_type);

ALTER TABLE public.pharmacy_compliance_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comp_alerts_staff_read ON public.pharmacy_compliance_alerts;
CREATE POLICY comp_alerts_staff_read ON public.pharmacy_compliance_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u
             WHERE u.id = auth.uid() AND u.tenant_id = pharmacy_compliance_alerts.tenant_id)
  );

-- Create an open deduped alert; resolves any earlier open alert of same type+drug.
CREATE OR REPLACE FUNCTION public.fn_raise_compliance_alert(
  p_tenant uuid, p_type text, p_severity text, p_drug uuid,
  p_title text, p_message text) RETURNS uuid
LANGUAGE plpgsql AS $fn$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pharmacy_compliance_alerts
   WHERE tenant_id = p_tenant AND alert_type = p_type
     AND drug_id IS NOT DISTINCT FROM p_drug AND status = 'open'
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id; -- dedupe: an open alert already covers this
  END IF;
  INSERT INTO public.pharmacy_compliance_alerts
    (tenant_id, alert_type, severity, drug_id, title, message)
  VALUES (p_tenant, p_type, p_severity, p_drug, p_title, p_message)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $fn$;

-- On-movement alerts: controlled-drug crossing, expiry windows, suspicious
-- repeat dispensing by the same operator in a short window.
CREATE OR REPLACE FUNCTION public.fn_pharmacy_compliance_movement_alerts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_drug         record;
  v_stock        integer;
  v_reorder      integer;
  v_count_24h    integer;
  v_expiry       date;
  v_sum24        integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT id, name, is_controlled, control_schedule, reorder_level
    INTO v_drug FROM public.pharmacy_drugs WHERE id = NEW.drug_id;

  -- Only concerned with regulated substances here (generic expiry alert already
  -- exists via fn_pharmacy_expiry_check for all drugs).
  IF NOT COALESCE(v_drug.is_controlled, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 5a) LOW_CONTROLLED_STOCK — current on-hand <= reorder level
  SELECT COALESCE(SUM(quantity_on_hand), 0) INTO v_stock
    FROM public.pharmacy_stock_batches
   WHERE drug_id = NEW.drug_id AND tenant_id = NEW.tenant_id;
  v_reorder := COALESCE(v_drug.reorder_level, 0);
  IF v_reorder > 0 AND v_stock <= v_reorder THEN
    PERFORM public.fn_raise_compliance_alert(
      NEW.tenant_id, 'LOW_CONTROLLED_STOCK', 'warning', NEW.drug_id,
      'Low controlled stock', v_drug.name || ' on hand ' || v_stock || ' at/below reorder level ' || v_reorder);
  END IF;

  -- 5b) EXPIRY_WARNING — any batch of the drug expiring within 30 days
  SELECT MIN(expiry_date) INTO v_expiry
    FROM public.pharmacy_stock_batches
   WHERE drug_id = NEW.drug_id AND expiry_date >= CURRENT_DATE
     AND expiry_date <= CURRENT_DATE + interval '30 days';
  IF v_expiry IS NOT NULL THEN
    PERFORM public.fn_raise_compliance_alert(
      NEW.tenant_id, 'EXPIRY_WARNING', 'warning', NEW.drug_id,
      'Controlled drug expiring', v_drug.name || ' has stock expiring ' || v_expiry || ' (within 30 days)');
  END IF;

  -- 5c) SUSPICIOUS_DISPENSING — same operator dispenses the same controlled
  -- drug more than 5 times in 24h, or total qty exceeds 5x the normal cap.
  IF NEW.type = 'dispense' THEN
    SELECT COUNT(*), COALESCE(SUM(quantity), 0) INTO v_count_24h, v_sum24
      FROM public.pharmacy_stock_movements
     WHERE drug_id = NEW.drug_id AND tenant_id = NEW.tenant_id
       AND created_by = NEW.created_by AND type = 'dispense'
       AND created_at >= now() - interval '24 hours';
    IF v_count_24h >= 5 THEN
      PERFORM public.fn_raise_compliance_alert(
        NEW.tenant_id, 'SUSPICIOUS_DISPENSING', 'critical', NEW.drug_id,
        'Suspicious dispensing pattern',
        v_drug.name || ' was dispensed ' || v_count_24h || ' times in 24h by the same operator (total ' || v_sum24 || ' units)');
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_pharmacy_compliance_movement_alerts ON public.pharmacy_stock_movements;
CREATE TRIGGER trg_pharmacy_compliance_movement_alerts
  AFTER INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_pharmacy_compliance_movement_alerts();
-- ---------------------------------------------------------------------------
-- 6. NAFDAC REPORTING ENGINE (RPCs � one per statutory report)
-- Report 1: Controlled drug usage (opening/received/dispensed/closing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_controlled_usage(
  p_tenant uuid, p_from date, p_to date, p_drug uuid DEFAULT NULL, p_form text DEFAULT NULL)
RETURNS TABLE (
  drug_id uuid, drug_name text, control_schedule text, nafdac_number text,
  opening_balance bigint, received bigint, dispensed bigint, closing_balance bigint,
  physical_stock bigint, variance bigint
)
LANGUAGE sql
AS $fn$
  WITH ledger AS (
    SELECT r.drug_id,
           d.name AS drug_name,
           COALESCE(d.control_schedule, '') AS control_schedule,
           COALESCE(d.nafdac_number, '') AS nafdac_number
      FROM public.controlled_drug_register r
      JOIN public.pharmacy_drugs d ON d.id = r.drug_id
     WHERE r.tenant_id = p_tenant
AND (p_drug IS NULL OR d.id = p_drug)
       AND d.is_controlled
       AND (p_form IS NULL OR d.form = p_form)
     GROUP BY r.drug_id, d.name, d.control_schedule, d.nafdac_number
  )
  SELECT
    l.drug_id,
    l.drug_name,
    l.control_schedule,
    l.nafdac_number,
    (SELECT COALESCE(SUM(quantity_received),0) - COALESCE(SUM(quantity_dispensed),0)
       FROM public.controlled_drug_register r
      WHERE r.drug_id = l.drug_id AND r.tenant_id = p_tenant
        AND r.created_at::date < p_from) AS opening_balance,
    (SELECT COALESCE(SUM(quantity_received),0)
       FROM public.controlled_drug_register r
      WHERE r.drug_id = l.drug_id AND r.tenant_id = p_tenant
        AND r.created_at::date BETWEEN p_from AND p_to) AS received,
    (SELECT COALESCE(SUM(quantity_dispensed),0)
       FROM public.controlled_drug_register r
      WHERE r.drug_id = l.drug_id AND r.tenant_id = p_tenant
        AND r.created_at::date BETWEEN p_from AND p_to) AS dispensed,
    (SELECT COALESCE(SUM(quantity_received),0) - COALESCE(SUM(quantity_dispensed),0)
       FROM public.controlled_drug_register r
      WHERE r.drug_id = l.drug_id AND r.tenant_id = p_tenant
        AND r.created_at::date <= p_to) AS closing_balance,
(SELECT COALESCE(SUM(quantity_on_hand),0)
       FROM public.pharmacy_stock_batches b
      WHERE b.drug_id = l.drug_id AND b.tenant_id = p_tenant) AS physical_stock,
    (SELECT COALESCE(SUM(quantity_received),0) - COALESCE(SUM(quantity_dispensed),0)
       FROM public.controlled_drug_register r
      WHERE r.drug_id = l.drug_id AND r.tenant_id = p_tenant
        AND r.created_at::date <= p_to)
      - (SELECT COALESCE(SUM(quantity_on_hand),0)
           FROM public.pharmacy_stock_batches b
          WHERE b.drug_id = l.drug_id AND b.tenant_id = p_tenant) AS variance
  FROM ledger l
 ORDER BY l.drug_name;
$fn$;

-- ---------------------------------------------------------------------------
-- Report 2: Stock movement � all movements in a window w/ actor + balance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_stock_movements(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_drug uuid DEFAULT NULL)
RETURNS TABLE (
  moved_at timestamptz, drug_id uuid, drug_name text, type text, quantity integer,
  batch_id uuid, branch_id uuid, actor_name text, source_ref text, notes text
)
LANGUAGE sql AS $fn$
  SELECT m.created_at, m.drug_id, d.name, m.type, m.quantity, m.batch_id,
         m.branch_id, COALESCE(u.full_name, 'system'), m.source_ref, m.notes
    FROM public.pharmacy_stock_movements m
    JOIN public.pharmacy_drugs d ON d.id = m.drug_id
    LEFT JOIN public.pharmacy_stock_batches b ON b.id = m.batch_id
    LEFT JOIN public.users u ON u.id = m.created_by
   WHERE m.tenant_id = p_tenant
     AND m.created_at BETWEEN p_from AND p_to
     AND (p_drug IS NULL OR m.drug_id = p_drug)
   ORDER BY m.created_at;
$fn$;

-- ---------------------------------------------------------------------------
-- Report 3: Expiry & recall � batches near/over expiry (recall watch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_expiry_report(
  p_tenant uuid, p_days integer DEFAULT 90, p_include_expired boolean DEFAULT true)
RETURNS TABLE (
  drug_id uuid, drug_name text, is_controlled boolean, control_schedule text,
  batch_id uuid, batch_number text, expiry_date date, quantity_on_hand integer,
  supplier_id uuid, supplier_name text, days_until_expiry integer, status text
)
LANGUAGE sql STABLE
AS $fn$
  SELECT b.drug_id, d.name,
         COALESCE(d.is_controlled, false),
         COALESCE(d.control_schedule, ''),
         b.id, b.batch_number, b.expiry_date, b.quantity_on_hand,
         b.supplier_id, COALESCE(s.name, ''),
         (b.expiry_date - CURRENT_DATE)::integer,
         CASE WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED'
              WHEN b.expiry_date <= CURRENT_DATE + make_interval(days => p_days) THEN 'EXPIRING'
              ELSE 'OK' END
    FROM public.pharmacy_stock_batches b
    JOIN public.pharmacy_drugs d ON d.id = b.drug_id
    LEFT JOIN public.pharmacy_suppliers s ON s.id = b.supplier_id
   WHERE b.tenant_id = p_tenant
     AND b.quantity_on_hand > 0
     AND (b.expiry_date <= CURRENT_DATE + make_interval(days => p_days))
     AND (p_include_expired OR b.expiry_date >= CURRENT_DATE)
   ORDER BY b.expiry_date, d.name;
$fn$;

-- ---------------------------------------------------------------------------
-- Report 4: Supplier sourcing � batch receipts by supplier (traceability)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compliance_supplier_report(
  p_tenant uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_supplier uuid DEFAULT NULL)
RETURNS TABLE (
  supplier_id uuid, supplier_name text, nafdac_license text,
  drug_id uuid, drug_name text, batch_number text, batch_id uuid,
  quantity_received bigint, cost_price numeric, batch_cost numeric,
  received_at date
)
LANGUAGE sql AS $fn$
  SELECT b.supplier_id, COALESCE(s.name, 'UNRECORDED SOURCE'), COALESCE(s.nafdac_license, ''),
         d.id, d.name, b.batch_number, b.id,
         COALESCE(m.qty_sum, 0), b.cost_price,
         COALESCE(m.qty_sum, 0) * b.cost_price,
         b.received_at::date
    FROM public.pharmacy_stock_batches b
    JOIN public.pharmacy_drugs d ON d.id = b.drug_id
    LEFT JOIN public.pharmacy_suppliers s ON s.id = b.supplier_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(m.quantity), 0) AS qty_sum
        FROM public.pharmacy_stock_movements m
       WHERE m.batch_id = b.id AND m.type IN ('in','transfer_in')
    ) m ON true
   WHERE b.tenant_id = p_tenant
     AND (p_supplier IS NULL OR b.supplier_id = p_supplier)
     AND (p_from IS NULL OR b.received_at >= p_from)
     AND (p_to IS NULL OR b.received_at <= p_to)
   ORDER BY b.received_at DESC;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. CONTROLLED DISPENSE RPC � pharmacist-safe dispensing wrap
-- Validates: NAFDAC registration + schedule + prescription linkage + cap.
-- Movement triggers then do the ledger + chained audit + alerts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pharmacy_controlled_dispense(
  p_tenant uuid, p_drug uuid, p_prescription uuid, p_patient uuid,
  p_branch uuid, p_qty integer, p_created_by uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE
  v_drug    record;
  v_alloc   record;
  v_count   integer := 0;
v_rx      record;
  v_branch  uuid := p_branch;
BEGIN
  IF p_drug IS NULL THEN RAISE EXCEPTION 'drug_id is required'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;
  IF p_prescription IS NULL OR p_patient IS NULL THEN
    RAISE EXCEPTION 'Controlled drugs require prescription and patient';
  END IF;

  -- Drug + regulatory profile
SELECT id, name, is_controlled, control_schedule, nafdac_number,
         max_qty_per_dispense INTO v_drug
    FROM public.pharmacy_drugs WHERE id = p_drug AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'drug not found in tenant'; END IF;
  IF NOT v_drug.is_controlled THEN
    RAISE EXCEPTION '% is not a controlled drug; use the regular dispensing route', v_drug.name;
  END IF;
  IF COALESCE(btrim(v_drug.nafdac_number), '') = '' THEN
    RAISE EXCEPTION 'Controlled drug % has no NAFDAC registration number', v_drug.name;
  END IF;

  -- Prescription validity: exists in tenant, matches patient, has this drug
  SELECT id, patient_id, status INTO v_rx
    FROM public.prescriptions p
   WHERE p.id = p_prescription AND p.tenant_id = p_tenant AND p.patient_id = p_patient;
  IF NOT FOUND THEN RAISE EXCEPTION 'Prescription not found for this patient'; END IF;
  IF v_rx.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Prescription is % and cannot be dispensed', v_rx.status;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.prescription_items pi
     WHERE pi.prescription_id = p_prescription AND pi.pharmacy_drug_id = p_drug
  ) THEN
    RAISE EXCEPTION 'Drug is not prescribed on this prescription';
  END IF;

  -- Per-dispense cap
  IF COALESCE(v_drug.max_qty_per_dispense, 0) > 0
     AND p_qty > v_drug.max_qty_per_dispense THEN
    RAISE EXCEPTION 'Quantity % exceeds the % dispense cap for %',
      p_qty, v_drug.max_qty_per_dispense, v_drug.name;
  END IF;

  -- Persist it, the FEFO allocator picks earliest expiring stock
  FOR v_alloc IN
    SELECT * FROM public.pharmacy_fefo_allocate(p_tenant, p_drug, v_branch, p_qty)
  LOOP
    INSERT INTO public.pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes, created_by)
VALUES (p_tenant, p_drug, v_alloc.batch_id, v_branch, 'dispense', v_alloc.quantity,
            p_prescription::text, p_notes, COALESCE(p_created_by, auth.uid()));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_raise_compliance_alert(uuid, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_controlled_usage(uuid, date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_stock_movements(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_expiry_report(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compliance_supplier_report(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_controlled_dispense(uuid, uuid, uuid, uuid, uuid, integer, uuid, text) TO authenticated;

COMMIT;
