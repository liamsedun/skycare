-- 0076: expenses carry the bank account they were paid from.
-- The ledger posting (hospital_bank_ledger.expense_id) used to derive the
-- account from payment_method; now the expense row records it explicitly so
-- the Expenses form can offer a "Pay from account" dropdown (Cash or bank).

alter table public.expenses
  add column if not exists account_id uuid references public.hospital_bank_accounts(id) on delete set null;

create index if not exists idx_expenses_account_id on public.expenses (account_id);

-- Backfill to the old behaviour: non-cash rows were auto-posted to the
-- tenant's first active bank; cash rows stay NULL (= Cash).
update public.expenses e
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