-- ============================================================================
-- SKYCARE — MIGRATION 0068: PHARMACY INVOICE ITEM COVERAGE COLUMNS
--
-- The billing API selects pharmacy_invoice_items(is_covered, co_pay_amount)
-- on every invoice (list + detail) and the invoice-create path expects them,
-- but the columns only ever existed on insurance_coverage / insurance_claims
-- (migration 0041). As a result GET /api/pharmacy/invoices and the New
-- Counter Sale / convert-to-sale flows failed with:
--   "column pharmacy_invoice_items_1.is_covered does not exist"
--
-- This migration adds the per-line coverage columns. Defaults match the
-- non-insurance case (covered, zero co-pay); the insurance/claim RPCs keep
-- writing their own values on the coverage/claims tables, and the invoice
-- create function (which was edited in production to stamp these columns)
-- now has columns to stamp.
-- ============================================================================

ALTER TABLE pharmacy_invoice_items
  ADD COLUMN IF NOT EXISTS is_covered   boolean        NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS co_pay_amount numeric(12,2) NOT NULL DEFAULT 0;
