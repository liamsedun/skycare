-- ============================================================================
-- SKYCARE - MIGRATION 0080: QA BRANCH-PRICE SMOKE FIXTURE PURGE
--
-- The Aug 14 branch-pricing smoke ran convert-sale against the live tenant.
-- dispensing_audit_logs is append-only (trg_dal_immutable RAISEs on
-- UPDATE/DELETE for every role) and migration 0070 re-pointed its user_id FK
-- to public.users: once convert-sale wrote the compliance rows, neither the
-- fixture drug (dal.drug_id RESTRICT) nor the QA users (users->dal cascade
-- hits the immutable trigger) could be removed through the API. Deleting the
-- drug also cascades its stock batch, whose AFTER-DELETE recompute trigger
-- re-INSERTs pharmacy_branch_stock under the dying drug (23503) - the same
-- blocker migration 0073 handled. So: drop both triggers, delete the fixture
-- rows, recreate the triggers verbatim from 0042/0033.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_dal_immutable ON public.dispensing_audit_logs;
DROP TRIGGER IF EXISTS trg_pharmacy_branch_stock ON public.pharmacy_stock_batches;

DELETE FROM public.dispensing_audit_logs WHERE drug_id = '80bcb8c6-3e40-46e4-a67c-25032bfb3d82';
DELETE FROM public.pharmacy_branch_stock WHERE drug_id = '80bcb8c6-3e40-46e4-a67c-25032bfb3d82';
DELETE FROM public.users WHERE id IN ('c687f3a2-9753-4365-a46a-2679bf5836e5', 'd431e467-48dc-4426-9fc1-f91c80e7e203');
DELETE FROM public.pharmacy_drugs WHERE id = '80bcb8c6-3e40-46e4-a67c-25032bfb3d82';

CREATE TRIGGER trg_dal_immutable
  BEFORE UPDATE OR DELETE ON public.dispensing_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_dal_immutable();

CREATE TRIGGER trg_pharmacy_branch_stock
  AFTER INSERT OR UPDATE OF quantity_on_hand, branch_id OR DELETE ON pharmacy_stock_batches
  FOR EACH ROW EXECUTE FUNCTION fn_pharmacy_refresh_branch_stock();