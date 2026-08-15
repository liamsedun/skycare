-- 0077: other_income carries the bank account the receipt was deposited into.
-- Mirrors 0076_expenses_account_id: the ledger posting (income_id) used to
-- derive the account from payment_method; now the row records it explicitly so
-- the Other Income form can offer a "Deposit into" dropdown (Cash or bank).

alter table public.other_income
  add column if not exists account_id uuid references public.hospital_bank_accounts(id) on delete set null;

create index if not exists idx_other_income_account_id on public.other_income (account_id);

-- Backfill to the old behaviour: non-cash rows were credited to the tenant's
-- first active bank; cash rows stay NULL (= Cash).
update public.other_income e
set account_id = (
  select b.id
  from public.hospital_bank_accounts b
  where b.tenant_id = e.tenant_id
    and b.is_active
  order by b.created_at asc
  limit 1
)
where e.account_id is null
  and e.payment_method is distinct from 'cash';