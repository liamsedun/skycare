-- ============================================================================
-- 0078_pharmacy_drugs_supplier.sql
-- Link catalogue drugs to their primary supplier.
--   pharmacy_drugs.supplier_id uuid -> pharmacy_suppliers(id)
--   ON DELETE SET NULL (deleting a supplier keeps the drug)
--   Index for the join + the "supplier's drugs" pinning list in the
--   New purchase order modal.
-- ============================================================================

alter table public.pharmacy_drugs
  add column if not exists supplier_id uuid
    references public.pharmacy_suppliers(id)
    on delete set null;

create index if not exists idx_pharmacy_drugs_supplier
  on public.pharmacy_drugs (supplier_id)
  where supplier_id is not null;