-- ============================================================================
-- 0065 — LAB REQUEST → INVOICE LINK
--
-- Completed lab requests can be billed in one click from the lab module.
-- lab_requests.invoice_id links the generated invoice so a request can only
-- be billed once (NULL = not yet billed).
-- ============================================================================

BEGIN;

ALTER TABLE public.lab_requests
  ADD COLUMN IF NOT EXISTS invoice_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_lab_requests_invoice' AND conrelid = 'public.lab_requests'::regclass
  ) THEN
    ALTER TABLE public.lab_requests
      ADD CONSTRAINT fk_lab_requests_invoice
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_requests_invoice
  ON public.lab_requests (invoice_id) WHERE invoice_id IS NOT NULL;

COMMIT;