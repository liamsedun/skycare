-- ============================================================================
-- SKYCARE — MIGRATION 0034: fix FEFO column ambiguity
-- The RETURN TABLE output columns (batch_number, ...) collided with the
-- source columns inside the SELECT — qualify the source table.
-- ============================================================================
CREATE OR REPLACE FUNCTION pharmacy_fefo_allocate(
  p_tenant  uuid,
  p_drug    uuid,
  p_branch  uuid,
  p_qty     integer
) RETURNS TABLE (batch_id uuid, batch_number text, expiry_date date, quantity integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_remaining integer := p_qty;
  r record;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  FOR r IN
    SELECT b.id AS bid, b.batch_number AS bnum, b.expiry_date AS bexp, b.quantity_on_hand AS bqty
      FROM pharmacy_stock_batches b
     WHERE b.drug_id = p_drug
       AND b.tenant_id = p_tenant
       AND b.branch_id IS NOT DISTINCT FROM p_branch
       AND b.quantity_on_hand > 0
       AND b.expiry_date >= CURRENT_DATE
     ORDER BY b.expiry_date ASC, b.quantity_on_hand DESC
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;
    IF r.bqty >= v_remaining THEN
      quantity := v_remaining;
      v_remaining := 0;
    ELSE
      quantity := r.bqty;
      v_remaining := v_remaining - r.bqty;
    END IF;
    batch_id := r.bid; batch_number := r.bnum; expiry_date := r.bexp;
    RETURN NEXT;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient FEFO stock: % still short', v_remaining;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_fefo_allocate(uuid, uuid, uuid, integer) TO authenticated;