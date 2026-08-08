-- ============================================================================
-- SKYCARE — MIGRATION 0037: PHARMACY BRANCH PARAM TYPE FIX
--
-- PostgREST calls with JSON strings (uuid params are passed as text literals,
-- producing "operator does not exist: uuid = text" for branch-id params).
-- Accept branch ids as text and cast internally, mirroring what the API
-- layer actually sends.
-- ============================================================================

CREATE OR REPLACE FUNCTION pharmacy_restock(
  p_tenant_id    uuid,
  p_drug         uuid,
  p_branch       text,          -- NULL = central
  p_batch_number text,
  p_expiry       date,
  p_qty          integer,
  p_cost         numeric DEFAULT 0,
  p_supplier     text DEFAULT NULL,
  p_location     text DEFAULT NULL,
  p_created_by   uuid DEFAULT NULL,
  p_source_ref   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_branch uuid := NULLIF(p_branch, '')::uuid;
  v_batch  uuid;
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
   WHERE drug_id = p_drug AND branch_id IS NOT DISTINCT FROM v_branch
     AND batch_number = p_batch_number
   LIMIT 1;

  IF v_batch IS NULL THEN
    INSERT INTO pharmacy_stock_batches
      (tenant_id, drug_id, branch_id, supplier_id, batch_number, expiry_date,
       quantity_on_hand, cost_price, location)
    VALUES (p_tenant_id, p_drug, v_branch,
            NULLIF(p_supplier, '')::uuid, p_batch_number, p_expiry,
            0, p_cost, p_location)
    RETURNING id INTO v_batch;
  ELSIF p_supplier IS NOT NULL THEN
    UPDATE pharmacy_stock_batches SET supplier_id = COALESCE(supplier_id, NULLIF(p_supplier, '')::uuid)
     WHERE id = v_batch;
  END IF;

  INSERT INTO pharmacy_stock_movements
    (tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes, created_by)
  VALUES
    (p_tenant_id, p_drug, v_batch, v_branch, 'in', p_qty,
     p_source_ref, p_location, p_created_by);

  RETURN v_batch;
END;
$$;

CREATE OR REPLACE FUNCTION pharmacy_dispense(
  p_tenant_id uuid,
  p_drug      uuid,
  p_branch    text,             -- NULL = central
  p_qty       integer,
  p_source_ref text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_notes     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_branch uuid := NULLIF(p_branch, '')::uuid;
  v_alloc record;
  v_count integer := 0;
BEGIN
  IF p_drug IS NULL THEN RAISE EXCEPTION 'drug_id is required'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;

  FOR v_alloc IN
    SELECT * FROM pharmacy_fefo_allocate(p_tenant_id, p_drug, v_branch, p_qty)
  LOOP
    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, source_ref, notes, created_by)
    VALUES
      (p_tenant_id, p_drug, v_alloc.batch_id, v_branch, 'dispense', v_alloc.quantity,
       p_source_ref, p_notes, p_created_by);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION pharmacy_transfer(
  p_tenant_id   uuid,
  p_drug        uuid,
  p_from_branch text,           -- NULL = central
  p_to_branch   text,           -- NULL = central
  p_qty         integer,
  p_created_by  uuid DEFAULT NULL,
  p_notes       text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_from_branch uuid := NULLIF(p_from_branch, '')::uuid;
  v_to_branch   uuid := NULLIF(p_to_branch, '')::uuid;
  v_alloc record;
  v_dest_batch uuid;
  v_count integer := 0;
BEGIN
  IF p_drug IS NULL THEN RAISE EXCEPTION 'drug_id is required'; END IF;
  IF v_from_branch IS NOT DISTINCT FROM v_to_branch THEN
    RAISE EXCEPTION 'source and destination branches must differ';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'quantity must be positive'; END IF;

  FOR v_alloc IN
    SELECT * FROM pharmacy_fefo_allocate(p_tenant_id, p_drug, v_from_branch, p_qty)
  LOOP
    -- source leg
    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, notes, created_by)
    VALUES
      (p_tenant_id, p_drug, v_alloc.batch_id, v_from_branch, 'transfer_out', v_alloc.quantity,
       p_notes, p_created_by);

    -- destination: mirror batch row in the target branch (same batch_number)
    SELECT id INTO v_dest_batch
      FROM pharmacy_stock_batches
     WHERE drug_id = p_drug AND branch_id IS NOT DISTINCT FROM v_to_branch
       AND batch_number = v_alloc.batch_number
     LIMIT 1;
    IF v_dest_batch IS NULL THEN
      INSERT INTO pharmacy_stock_batches
        (tenant_id, drug_id, branch_id, batch_number, expiry_date, quantity_on_hand, cost_price, location)
      SELECT p_tenant_id, p_drug, v_to_branch, batch_number, expiry_date, 0, cost_price, location
        FROM pharmacy_stock_batches WHERE id = v_alloc.batch_id
      RETURNING id INTO v_dest_batch;
    END IF;

    INSERT INTO pharmacy_stock_movements
      (tenant_id, drug_id, batch_id, branch_id, type, quantity, notes, created_by)
    VALUES
      (p_tenant_id, p_drug, v_dest_batch, v_to_branch, 'transfer_in', v_alloc.quantity,
       p_notes, p_created_by);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION pharmacy_restock(uuid, uuid, text, text, date, integer, numeric, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_dispense(uuid, uuid, text, integer, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_transfer(uuid, uuid, text, text, integer, uuid, text) TO authenticated;