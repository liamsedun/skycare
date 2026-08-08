-- ============================================================================
-- 0057 — WARD DISCHARGE BILLING
--  * ward_discharge_charges — posts the daily room charge (ward_daily_rates ×
--    nights stayed) to the central invoices ledger as a "Ward" invoice item
--    when a patient is discharged. No rate configured  => no charge (returns
--    NULL). Re-calls are idempotent via invoices.admission_id.
--  * Additive ALTER only: invoices gains a nullable admission_id FK so ward
--    billing links back to the admission (precedent: 0008 added vat columns
--    to invoice_items and attending_staff_id to invoices).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Link central invoices back to the ward admission
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS admission_id uuid REFERENCES public.admissions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_admission ON public.invoices (tenant_id, admission_id);

-- ---------------------------------------------------------------------------
-- 2. ward_discharge_charges — post room charge for a discharged admission
--    Idempotent: if an invoice is already linked to the admission, the same
--    invoice bundle is returned instead of double-posting. Invoice number
--    follows the app convention (tenant invoice prefix + zero-padded count).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ward_discharge_charges(
  p_tenant uuid,
  p_admission_id uuid,
  p_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_adm        public.admissions%ROWTYPE;
  v_bed        public.beds%ROWTYPE;
  v_ward       public.wards%ROWTYPE;
  v_rate       numeric(12,2);
  v_nights     integer;
  v_charge     numeric(12,2);
  v_prefix     text;
  v_seq        integer;
  v_num        text;
  v_invoice    uuid;
  v_item       uuid;
  v_existing   uuid;
  v_desc       text;
BEGIN
  -- Idempotency: an invoice already exists for this admission
  SELECT id INTO v_existing FROM public.invoices
   WHERE tenant_id = p_tenant AND admission_id = p_admission_id
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'invoice_id', v_existing,
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_existing),
      'charge', (SELECT total_amount FROM public.invoices WHERE id = v_existing),
      'already_posted', true
    );
  END IF;

  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMISSION_NOT_FOUND'; END IF;
  IF v_adm.status <> 'discharged' THEN RAISE EXCEPTION 'ADMISSION_NOT_DISCHARGED'; END IF;

  -- No configured rate => nothing to bill (silent skip)
  SELECT rate INTO v_rate FROM public.ward_daily_rates
   WHERE tenant_id = p_tenant AND ward_id = (SELECT ward_id FROM public.beds WHERE id = v_adm.bed_id);
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_bed FROM public.beds WHERE id = v_adm.bed_id;
  SELECT * INTO v_ward FROM public.wards WHERE id = v_bed.ward_id;

  v_nights := GREATEST(1, (v_adm.discharged_at::date - v_adm.admitted_at::date));
  v_charge := ROUND(v_rate * v_nights, 2);
  v_desc := 'Ward charges — ' || COALESCE(v_ward.name, 'Ward') ||
            ' · Bed ' || COALESCE(v_bed.bed_number, '—') ||
            ' · ' || v_nights || ' night' || CASE WHEN v_nights = 1 THEN '' ELSE 's' END;

  -- Invoice number: tenant prefix (settings JSONB, default INV-) + count + 1
  SELECT COALESCE(NULLIF(btrim(settings->>'invoicePrefix'), ''), 'INV-') INTO v_prefix
    FROM public.tenants WHERE id = p_tenant;
  IF NOT v_prefix LIKE '%-' THEN v_prefix := v_prefix || '-'; END IF;
  SELECT COUNT(*) + 1 INTO v_seq FROM public.invoices WHERE tenant_id = p_tenant;
  v_num := v_prefix || lpad(v_seq::text, 4, '0');

  INSERT INTO public.invoices
    (tenant_id, branch_id, patient_id, invoice_number, issue_date, status,
     subtotal, tax_amount, discount_amount, total_amount, paid_amount,
     insurance_claimable, notes, created_by, attending_staff_id, admission_id)
  VALUES
    (p_tenant, v_adm.branch_id, v_adm.patient_id, v_num, CURRENT_DATE, 'pending',
     v_charge, 0, 0, v_charge, 0, false,
     'Ward charges for admission ' || v_adm.id, p_by, p_by, v_adm.id)
  RETURNING id INTO v_invoice;

  INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total_price)
  VALUES (v_invoice, v_desc, v_nights, v_rate, v_charge)
  RETURNING id INTO v_item;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice,
    'invoice_number', v_num,
    'item_id', v_item,
    'description', v_desc,
    'charge', v_charge,
    'nights', v_nights,
    'rate', v_rate,
    'already_posted', false
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.ward_discharge_charges(uuid, uuid, uuid) TO authenticated;

COMMIT;
