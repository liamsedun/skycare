-- 0072: purge append-only compliance-audit rows of removed tenant fe46a3bb (Liamsfield Hospitals, Aug 2026).
-- Remaining tenants after this wipe: demoCare Hospital (10000000-...-0001), LiamsField Hospital (1b4741cf-...-48ce).
-- Same pattern as 0071: drop immutability triggers, delete the rows, recreate the triggers.

DROP TRIGGER IF EXISTS trg_cdr_immutable ON public.controlled_drug_register;
DROP TRIGGER IF EXISTS trg_dal_immutable ON public.dispensing_audit_logs;

DELETE FROM public.controlled_drug_register
WHERE tenant_id NOT IN (
  '10000000-0000-0000-0000-000000000001',
  '1b4741cf-e2d7-41f7-93ae-746f701c48ce'
);

DELETE FROM public.dispensing_audit_logs
WHERE tenant_id NOT IN (
  '10000000-0000-0000-0000-000000000001',
  '1b4741cf-e2d7-41f7-93ae-746f701c48ce'
);

CREATE TRIGGER trg_cdr_immutable BEFORE UPDATE OR DELETE ON public.controlled_drug_register FOR EACH ROW EXECUTE FUNCTION public.fn_cdr_immutable();
CREATE TRIGGER trg_dal_immutable BEFORE UPDATE OR DELETE ON public.dispensing_audit_logs FOR EACH ROW EXECUTE FUNCTION public.fn_dal_immutable();