-- OFX is a bank statement inbox, not a financial-entry/ledger import.
-- Apply to a QA branch first. Existing cash, revenue, expense and opening balances are untouched.
create table if not exists public.ofx_bank_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id),
  account_id uuid,
  bank_ref text not null check (length(bank_ref) between 3 and 180),
  filename text not null check (length(filename) between 1 and 120),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (account_id, organization_id) references public.finance_accounts(id, organization_id)
);
create table if not exists public.ofx_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id),
  import_id uuid not null,
  bank_ref text not null check (length(bank_ref) between 3 and 180),
  fitid text not null check (length(fitid) between 1 and 180),
  posted_on date not null,
  amount numeric(15,2) not null check (amount <> 0),
  description text not null check (length(description) between 1 and 300),
  transaction_type text not null default '' check (length(transaction_type) <= 24),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (import_id, organization_id) references public.ofx_bank_imports(id, organization_id),
  unique (organization_id, bank_ref, fitid)
);
create index if not exists ofx_bank_transactions_org_date_idx on public.ofx_bank_transactions(organization_id, posted_on desc, created_at desc);
alter table public.ofx_bank_imports enable row level security;
alter table public.ofx_bank_transactions enable row level security;
revoke all on public.ofx_bank_imports, public.ofx_bank_transactions from public, authenticated;
grant select on public.ofx_bank_imports, public.ofx_bank_transactions to authenticated;
do $$ begin
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='ofx_bank_imports' and policyname='ofx_bank_imports_read') then
  create policy ofx_bank_imports_read on public.ofx_bank_imports for select to authenticated using (public.can_access_organization(organization_id));
 end if;
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='ofx_bank_transactions' and policyname='ofx_bank_transactions_read') then
  create policy ofx_bank_transactions_read on public.ofx_bank_transactions for select to authenticated using (public.can_access_organization(organization_id));
 end if;
end $$;
create or replace function public.import_ofx_bank_statement(
  p_organization_id uuid, p_account_id uuid, p_bank_ref text, p_filename text, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public, neon_auth as $$
declare
  v_batch uuid;
  v_row jsonb;
  v_date date;
  v_amount numeric(15,2);
  v_fitid text;
  v_description text;
  v_type text;
  v_total integer;
  v_imported integer := 0;
  v_ref text := btrim(coalesce(p_bank_ref, ''));
  v_filename text := btrim(coalesce(p_filename, ''));
  v_account_exists boolean;
  v_tier text;
begin
  if not public.can_access_organization(p_organization_id) then raise exception 'Acesso negado à empresa'; end if;
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if length(v_ref) not between 3 and 180 or length(v_filename) not between 1 and 120 then
    raise exception 'Identificação do extrato inválida';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Linhas OFX inválidas'; end if;
  v_total := jsonb_array_length(p_rows);
  if v_total < 1 or v_total > 500 then raise exception 'Selecione de 1 a 500 linhas'; end if;
  select control_tier into v_tier from public.organization_settings where organization_id=p_organization_id and active=true;
  if coalesce(v_tier, 'unconfigured') not in ('simple','basic','complete') then raise exception 'Configure o controle financeiro antes de importar OFX'; end if;
  if v_tier = 'complete' and p_account_id is null then raise exception 'Selecione a conta financeira do extrato'; end if;
  if p_account_id is not null then
    select exists(select 1 from public.finance_accounts where id=p_account_id and organization_id=p_organization_id and active=true)
      into v_account_exists;
    if not v_account_exists then raise exception 'Conta financeira inválida para esta empresa'; end if;
  end if;
  insert into public.ofx_bank_imports(organization_id, account_id, bank_ref, filename, created_by)
    values (p_organization_id,p_account_id,v_ref,v_filename,auth.uid()) returning id into v_batch;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_fitid := btrim(coalesce(v_row->>'fitid', ''));
    v_description := btrim(coalesce(v_row->>'description', ''));
    v_type := btrim(coalesce(v_row->>'transactionType', ''));
    if length(v_fitid) not between 1 and 180 or length(v_description) not between 1 and 300 or length(v_type) > 24 then
      raise exception 'Movimentação OFX com identificador ou descrição inválidos';
    end if;
    if coalesce(v_row->>'postedOn','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data OFX inválida'; end if;
    v_date := (v_row->>'postedOn')::date;
    if coalesce(v_row->>'amount','') !~ '^-?\d{1,9}\.\d{2}$' then raise exception 'Valor OFX inválido'; end if;
    v_amount := (v_row->>'amount')::numeric(15,2);
    if v_amount = 0 then raise exception 'Movimentação OFX de valor zero'; end if;
    insert into public.ofx_bank_transactions(organization_id, import_id, bank_ref, fitid, posted_on, amount, description, transaction_type, created_by)
      values (p_organization_id,v_batch,v_ref,v_fitid,v_date,v_amount,v_description,v_type,auth.uid())
      on conflict (organization_id,bank_ref,fitid) do nothing;
    if found then v_imported := v_imported + 1; end if;
  end loop;
  if v_imported = 0 then delete from public.ofx_bank_imports where id=v_batch; end if;
  return jsonb_build_object('imported',v_imported,'duplicates',v_total-v_imported,'batchId',case when v_imported>0 then v_batch else null end);
end $$;
revoke all on function public.import_ofx_bank_statement(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.import_ofx_bank_statement(uuid,uuid,text,text,jsonb) to authenticated;
