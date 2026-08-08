-- ============================================================================
-- SKYCARE — MIGRATION 0035: PHARMACY INVENTORY OPERATIONS (atomic procedures)
--
-- Business operations as transactional SQL so multi-batch FEFO splits,
-- cross-branch transfers and restock can never leave partial ledger state,
-- and concurrent dispensers cannot oversell.
-- All three raise descriptive exceptions the API layer renders as 400s.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pharmacy_restock — receive goods:
--   • creates the batch row if new, else appends to the existing batch
--   • always records the ledger row ('in') so totals stay provable
--   • rejects already-expired goods; requires positive quantity
-- Returns: the batch id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_restock(
  p_tenant       uuid,
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

-- ----------------------------------------------------------------------------
-- pharmacy_dispense — FEFO-only dispensing for any reason (repeat/dispense
--   for prescriptions created with the FEFO flag, cash sales, ward supply).
--   Splits across batches oldest-expiry-first, never touches expired stock,
--   blocks if the total is not available.
-- Returns: number of allocations written.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_dispense(
  p_tenant_id uuid,
  p_drug      uuid,
  p_branch    uuid,
  p_qty       integer,
  p_source_ref text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_notes     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_alloc record;
  v_count integer := 0;
BEGIN
  IF p_drug IS NULL THEN RAISE EXCEPTION 'drug_id is required'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;

  FOR v_alloc IN
    SELECT * FROM pharmacy_fefo_allocate(p_tenant_id, p_drug, p_branch, p_qty)
  LOOP
    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes, created_by)
    VALUES
      (p_tenant_id, p_drug, v_alloc.batch_id, p_branch, 'dispense', v_alloc.quantity,
       p_source_ref, p_notes, p_created_by);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- pharmacy_transfer — move qty of a drug from one branch to another.
--   FEFO-deducts from the source; the destination receives a sibling batch
--   row (same batch number) so per-branch stock stays correct; both legs are
--   ledgered transfer_out / transfer_in.
-- Returns: number of batch allocations written.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pharmacy_transfer(
  p_tenant_id uuid,
  p_drug      uuid,
  p_from_branch uuid,
  p_to_branch   uuid,
  p_qty       integer,
  p_created_by uuid DEFAULT NULL,
  p_notes     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_alloc record;
  v_dest_batch uuid;
  v_count integer := 0;
BEGIN
  IF p_drug IS NULL THEN RAISE EXCEPTION 'drug_id is required'; END IF;
  IF p_from_branch IS NOT DISTINCT FROM p_to_branch THEN
    RAISE EXCEPTION 'source and destination branches must differ';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;

  FOR v_alloc IN
    SELECT * FROM pharmacy_fefo_allocate(p_tenant_id, p_drug, p_from_branch, p_qty)
  LOOP
    -- source leg
    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, notes, created_by)
    VALUES
      (p_tenant_id, p_drug, v_alloc.batch_id, p_from_branch, 'transfer_out', v_alloc.quantity,
       p_notes, p_created_by);

    -- destination legit: mirror batch row in the target branch (same batch_no)
    SELECT id INTO v_dest_batch
      FROM pharmacy_stock_batches
     WHERE drug_id = p_drug AND branch_id IS NOT DISTINCT FROM p_to_branch
       AND batch_number = v_alloc.batch_number
     LIMIT 1;
    IF v_dest_batch IS NULL THEN
      INSERT INTO pharmacy_stock_batches
        (tenant_id, drug_id, branch_id, batch_number, expiry_date, quantity_on_hand, cost_price, location)
      SELECT p_tenant_id, p_drug, p_to_branch, batch_number, expiry_date, 0, cost_price, location
        FROM pharmacy_stock_batches WHERE id = v_alloc.batch_id
      RETURNING id INTO v_dest_batch;
    END IF;

    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, notes, created_by)
    VALUES
      (p_tenant_id, p_drug, v_dest_batch, p_to_branch, 'transfer_in', v_alloc.quantity,
       p_notes, p_created_by);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_restock(uuid, uuid, uuid, text, date, integer, numeric, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_dispense(uuid, uuid, uuid, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_transfer(uuid, uuid, uuid, uuid, integer, uuid, text) TO authenticated;