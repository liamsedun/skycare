-- ============================================================================
-- SKYCARE — MIGRATION 0039: LOW-STOCK DEDUPE TYPE FIX
--
-- fn_notify_low_stock compared the uuid drug id against notifications
-- reference_id as TEXT (NEW.drug_id::text), but reference_id is uuid, so the
-- trigger raised "operator does not exist: uuid = text" on every movement.
-- Compare directly against the uuid column.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_notify_low_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_drug   record;
  v_reorder integer;
  v_net    integer;
BEGIN
  SELECT name, reorder_level INTO v_drug FROM pharmacy_drugs WHERE id = NEW.drug_id;
  v_reorder := COALESCE(v_drug.reorder_level, 0);

  SELECT COALESCE(SUM(quantity_on_hand), 0) INTO v_net
    FROM pharmacy_stock_batches
   WHERE drug_id = NEW.drug_id AND branch_id IS NOT DISTINCT FROM NEW.branch_id;

  IF v_net > v_reorder THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- fire once per crossing: skip repeats while still at/below reorder
  IF EXISTS (SELECT 1 FROM notifications
              WHERE tenant_id = NEW.tenant_id
                AND event = 'low_stock'
                AND reference_type = 'pharmacy_drug'
                AND reference_id = NEW.drug_id
                AND created_at > now() - interval '6 hours') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO notifications (tenant_id, channel, event, title, message, reference_type, reference_id)
  VALUES (
    NEW.tenant_id, 'in_app', 'low_stock', 'Low stock alert',
    'Stock for ' || COALESCE(v_drug.name, 'drug') || ' is at ' || v_net || ' (reorder level ' || v_reorder || ')',
    'pharmacy_drug', NEW.drug_id
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;