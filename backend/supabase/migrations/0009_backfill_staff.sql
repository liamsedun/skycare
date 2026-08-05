-- 0009: Backfill staff rows for existing clinical user accounts.
-- Seed users (doctors/nurses/pharmacists/etc.) were created before the staff
-- table existed; give them staff records so roster, availability, and the
-- doctor pickers in appointments work. Idempotent.
do $$
declare
  rec record;
  seq int;
begin
  for rec in
    select u.id, u.tenant_id, u.branch_id, u.created_at
    from public.users u
    where u.role in ('doctor', 'nurse', 'pharmacist', 'lab_tech', 'cashier', 'receptionist')
      and not exists (
        select 1 from public.staff s where s.user_id = u.id
      )
    order by u.tenant_id, u.created_at
  loop
    select coalesce(count(*), 0) + 1 into seq
    from public.staff
    where tenant_id = rec.tenant_id;
    insert into public.staff (
      tenant_id, branch_id, user_id, staff_number, is_available, created_at
    ) values (
      rec.tenant_id,
      rec.branch_id,
      rec.id,
      'STF-' || lpad(seq::text, 4, '0'),
      true,
      rec.created_at
    )
    on conflict do nothing;
  end loop;
end $$;
