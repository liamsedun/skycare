-- ============================================================================
-- 0067 — LAB WALK-IN / EXTERNAL CUSTOMER PAYMENTS
--
-- Walk-in customers (drop-in patients or referrals from other clinics) pay
-- up-front for lab services (cash / bank transfer / Paystack) and get a
-- payment receipt instead of an invoice, and are never offered credit.
--   patients.is_walk_in          — fast-created record, no portal login
--   lab_requests.referrer        — referring clinic / source of the request
--   lab_requests.payment_id      — up-front payment recorded at request time
-- ============================================================================

BEGIN;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;

ALTER TABLE public.lab_requests
  ADD COLUMN IF NOT EXISTS referrer text;

ALTER TABLE public.lab_requests
  ADD COLUMN IF NOT EXISTS payment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_lab_requests_payment' AND conrelid = 'public.lab_requests'::regclass
  ) THEN
    ALTER TABLE public.lab_requests
      ADD CONSTRAINT fk_lab_requests_payment
      FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_requests_payment
  ON public.lab_requests (payment_id) WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_is_walk_in
  ON public.patients (is_walk_in) WHERE is_walk_in;

COMMIT;
