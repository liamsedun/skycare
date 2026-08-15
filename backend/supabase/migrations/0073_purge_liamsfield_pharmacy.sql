-- 0073: purge remaining fe46a3bb (Liamsfield Hospitals) pharmacy rows that block the tenant wipe.
-- The API wipe deleted most tables, but three groups could not be removed via PostgREST:
--   1. pharmacy_ai_decisions  -> append-only trigger trg_ai_decisions_immutable (0043)
--   2. pharmacy_drugs / pharmacy_stock_batches / pharmacy_stock_movements / pharmacy_branch_stock
--      -> pharmacy_stock_batches' AFTER DELETE trigger (trg_pharmacy_branch_stock, 0033) INSERTs
--         a new pharmacy_branch_stock row per deleted batch; once the parent drug is cascade-deleted
--         that INSERT violates pharmacy_branch_stock_drug_id_fkey (observed 23503).
--   3. pharmacy_branch_stock has no tenant_id (reached only via cascades; API cannot target it).
-- Triggers are dropped, rows purged in FK-safe order, triggers recreated. Idempotent.

DROP TRIGGER IF EXISTS trg_ai_decisions_immutable ON public.pharmacy_ai_decisions;
DROP TRIGGER IF EXISTS trg_pharmacy_branch_stock ON public.pharmacy_stock_batches;

DELETE FROM public.pharmacy_ai_decisions
WHERE tenant_id = 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3';

DELETE FROM public.pharmacy_stock_movements
WHERE tenant_id = 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3';

DELETE FROM public.pharmacy_stock_batches
WHERE tenant_id = 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3';

DELETE FROM public.pharmacy_branch_stock
WHERE drug_id IN (SELECT id FROM public.pharmacy_drugs WHERE tenant_id = 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3')
   OR branch_id IN (SELECT id FROM public.branches WHERE tenant_id = 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3');

DELETE FROM public.pharmacy_drugs
WHERE tenant_id = 'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3';

CREATE TRIGGER trg_ai_decisions_immutable
  BEFORE UPDATE OR DELETE ON public.pharmacy_ai_decisions
  FOR EACH ROW EXECUTE FUNCTION public.fn_ai_decisions_immutable();

CREATE TRIGGER trg_pharmacy_branch_stock
  AFTER INSERT OR UPDATE OF quantity_on_hand, branch_id OR DELETE ON public.pharmacy_stock_batches
  FOR EACH ROW EXECUTE FUNCTION public.fn_pharmacy_refresh_branch_stock();