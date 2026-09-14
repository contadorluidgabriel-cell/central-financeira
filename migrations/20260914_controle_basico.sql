-- Controle Básico — extensão aditiva sobre a estrutura do Controle Simples.
-- Aplicar primeiro no branch Neon de teste. Não aplicar automaticamente no branch de produção.

alter table public.organization_settings
  add column if not exists pending_control_tier text,
  add column if not exists pending_control_tier_effective date,
  add column if not exists pending_expense_mode text,
  add column if not exists pending_expense_mode_effective date;

alter table public.organization_settings
  alter column expense_mode set default 'monthly';

create table if not exists public.finance_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  supplier_number bigint generated always as identity,
  code text generated always as ('FOR-' || lpad(supplier_number::text, 6, '0')) stored,
  external_code text,
  name text not null,
  document text,
  phone text,
  email text,
  notes text,
  is_unspecified boolean not null default false,
  active boolean not null default true,
  merged_into uuid references public.finance_suppliers(id) on delete set null,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create unique index if not exists finance_suppliers_code_uq
  on public.finance_suppliers(code);
create unique index if not exists finance_suppliers_unspecified_uq
  on public.finance_suppliers(organization_id)
  where is_unspecified = true and merged_into is null;
create index if not exists finance_suppliers_org_name_idx
  on public.finance_suppliers(organization_id, lower(name));
create index if not exists finance_suppliers_org_document_idx
  on public.finance_suppliers(organization_id, document)
  where document is not null and trim(document) <> '';

alter table public.financial_entries
  add column if not exists supplier_id uuid references public.finance_suppliers(id) on delete restrict;

create index if not exists financial_entries_supplier_idx
  on public.financial_entries(organization_id, supplier_id, competency);

alter table public.finance_suppliers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_suppliers' and policyname='finance_suppliers_select_v1') then
    create policy finance_suppliers_select_v1 on public.finance_suppliers
      for select to authenticated
      using (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_suppliers' and policyname='finance_suppliers_insert_v1') then
    create policy finance_suppliers_insert_v1 on public.finance_suppliers
      for insert to authenticated
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_suppliers' and policyname='finance_suppliers_update_v1') then
    create policy finance_suppliers_update_v1 on public.finance_suppliers
      for update to authenticated
      using (is_super_admin() or organization_id = auth.organization_id())
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_suppliers' and policyname='finance_suppliers_delete_v1') then
    create policy finance_suppliers_delete_v1 on public.finance_suppliers
      for delete to authenticated
      using (is_super_admin() or organization_id = auth.organization_id());
  end if;
end $$;

grant select, insert, update, delete on public.finance_suppliers to authenticated;
grant usage, select on all sequences in schema public to authenticated;
