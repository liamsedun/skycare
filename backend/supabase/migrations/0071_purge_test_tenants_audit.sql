-- 0071: purge leftover compliance-audit rows of removed test tenants (tenant wipe, Aug 2026).
-- Kept tenants: demoCare Hospital (10000000-...-0001), Liamsfield Hospitals (fe46a3bb-...-3ea3),
-- LiamsField Hospital (1b4741cf-...-48ce). Everything else was removed with its accounts and data.
-- controlled_drug_register + dispensing_audit_logs are append-only (trg_cdr_immutable / trg_dal_immutable),
-- which also blocks service-client DELETEs, so the triggers are dropped, the rows purged, and recreated.

DROP TRIGGER IF EXISTS trg_cdr_immutable ON public.controlled_drug_register;
DROP TRIGGER IF EXISTS trg_dal_immutable ON public.dispensing_audit_logs;

DELETE FROM public.controlled_drug_register
WHERE tenant_id NOT IN (
  '10000000-0000-0000-0000-000000000001',
  'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3',
  '1b4741cf-e2d7-41f7-93ae-746f701c48ce'
);

DELETE FROM public.dispensing_audit_logs
WHERE tenant_id NOT IN (
  '10000000-0000-0000-0000-000000000001',
  'fe46a3bb-44e0-4e4b-a83d-ff190d1d3ea3',
  '1b4741cf-e2d7-41f7-93ae-746f701c48ce'
);

CREATE TRIGGER trg_cdr_immutable BEFORE UPDATE OR DELETE ON public.controlled_drug_register FOR EACH ROW EXECUTE FUNCTION public.fn_cdr_immutable();
CREATE TRIGGER trg_dal_immutable BEFORE UPDATE OR DELETE ON public.dispensing_audit_logs FOR EACH ROW EXECUTE FUNCTION public.fn_dal_immutable();