-- ============================================================================
-- SKYCARE — MIGRATION 0036: PHARMACY RESTOCK PARAM FIX
--
-- 0035 declared the restock parameter as p_tenant but the body references
-- p_tenant_id — plpgsql compiles lazily so the function deployed cleanly and
-- only fails at call time. Recreate with a consistent p_tenant_id parameter.
-- ============================================================================

DROP FUNCTION pharmacy_restock(uuid, uuid, uuid, text, date, integer, numeric, uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION pharmacy_restock(
  p_tenant_id    uuid,
  p_drug         uuid,
  p_branch       uuid,          -- NULL = central
  p_batch_number text,
  p_expiry       date,
  p_qty          integer,
  p_cost         numeric DEFAULT 0,
  p_supplier     uuid DEFAULT NULL,
  p_location     text DEFAULT NULL,
  p_created_by   uuid DEFAULT NULL,
  p_source_ref   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_batch uuid;
BEGIN
  IF p_drug IS NULL THEN RAISE EXCEPTION 'drug_id is required'; END IF;
  IF p_batch_number IS NULL OR btrim(p_batch_number) = '' THEN
    RAISE EXCEPTION 'batch_number is required';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;
  IF p_expiry IS NULL OR p_expiry <= CURRENT_DATE THEN
    RAISE EXCEPTION 'expiry date must be in the future';
  END IF;
  IF p_cost < 0 THEN RAISE EXCEPTION 'cost cannot be negative'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pharmacy_drugs WHERE id = p_drug AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'drug not found in tenant';
  END IF;

  -- reuse an existing batch (same drug + branch + batch number) or create one
  SELECT id INTO v_batch
    FROM pharmacy_stock_batches
   WHERE drug_id = p_drug AND branch_id IS NOT DISTINCT FROM p_branch
     AND batch_number = p_batch_number
   LIMIT 1;

  IF v_batch IS NULL THEN
    INSERT INTO pharmacy_stock_batches
      (tenant_id, drug_id, branch_id, supplier_id, batch_number, expiry_date,
       quantity_on_hand, cost_price, location)
    VALUES (p_tenant_id, p_drug, p_branch, p_supplier, p_batch_number, p_expiry,
            0, p_cost, p_location)
    RETURNING id INTO v_batch;
  ELSIF p_supplier IS NOT NULL THEN
    UPDATE pharmacy_stock_batches SET supplier_id = COALESCE(supplier_id, p_supplier)
     WHERE id = v_batch;
  END IF;

  INSERT INTO pharmacy_stock_movements
    (tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes, created_by)
  VALUES
    (p_tenant_id, p_drug, v_batch, p_branch, 'in', p_qty,
     p_source_ref, p_location, p_created_by);

  RETURN v_batch;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_restock(uuid, uuid, uuid, text, date, integer, numeric, uuid, text, uuid, text) TO authenticated;
