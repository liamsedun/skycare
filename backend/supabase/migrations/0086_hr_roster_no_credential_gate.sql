-- 0086: HR roster — drop the verified-credential requirement for shift assignment.
-- User request (Aug 16): the admin could not schedule clinical staff (doctors,
-- medical officers, nurses) because hr_assign_shift required a verified,
-- unexpired staff_credentials row. Credential enforcement stays visible on the
-- HR Credentials page; roster assignment is scheduling, not licensure.
-- Conflict guards (UNIQUE staff_id+shift_date, trg_staff_shifts_conflict vs
-- duty_roster) are table-level and untouched.

CREATE OR REPLACE FUNCTION public.hr_assign_shift(
  p_tenant uuid,
  p_staff_id uuid,
  p_shift_id uuid,
  p_date date,
  p_ward_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE
  v_staff public.staff%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_row public.staff_shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_staff FROM public.staff WHERE id = p_staff_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_NOT_FOUND'; END IF;
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;

  INSERT INTO public.staff_shifts
    (tenant_id, branch_id, staff_id, shift_id, ward_id, shift_date, notes, created_by)
  VALUES (p_tenant, v_staff.branch_id, p_staff_id, p_shift_id,
          COALESCE(p_ward_id, v_shift.ward_id), p_date, p_notes, p_created_by)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'staff_id', v_row.staff_id,
                            'shift_id', v_row.shift_id, 'shift_date', v_row.shift_date);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.hr_assign_shift(uuid, uuid, uuid, date, uuid, text, uuid) TO authenticated;