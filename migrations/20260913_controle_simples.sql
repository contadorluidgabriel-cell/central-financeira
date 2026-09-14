-- Controle Simples — additive migration for the isolated Neon test branch.
-- No production branch should receive this migration before validation.

alter table public.organization_settings
  add column if not exists control_tier text not null default 'simple',
  add column if not exists control_start_month date,
  add column if not exists pending_revenue_mode text,
  add column if not exists pending_revenue_mode_effective date;

create table if not exists public.finance_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  customer_number bigint generated always as identity,
  code text generated always as ('CLI-' || lpad(customer_number::text, 6, '0')) stored,
  external_code text,
  name text not null,
  document text,
  phone text,
  email text,
  notes text,
  is_consumer_final boolean not null default false,
  active boolean not null default true,
  merged_into uuid references public.finance_customers(id) on delete set null,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create unique index if not exists finance_customers_code_uq
  on public.finance_customers(code);
create unique index if not exists finance_customers_consumer_final_uq
  on public.finance_customers(organization_id)
  where is_consumer_final = true and merged_into is null;
create index if not exists finance_customers_org_name_idx
  on public.finance_customers(organization_id, lower(name));
create index if not exists finance_customers_org_document_idx
  on public.finance_customers(organization_id, document)
  where document is not null and trim(document) <> '';

create table if not exists public.finance_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) > 0)
);

create unique index if not exists finance_payment_methods_org_name_uq
  on public.finance_payment_methods(organization_id, lower(name));

alter table public.financial_entries
  add column if not exists customer_id uuid references public.finance_customers(id) on delete restrict,
  add column if not exists payment_method_id uuid references public.finance_payment_methods(id) on delete set null,
  add column if not exists entry_status text not null default 'active',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists adjustment_kind text,
  add column if not exists source_entry_id uuid references public.financial_entries(id) on delete set null;

create index if not exists financial_entries_customer_idx
  on public.financial_entries(organization_id, customer_id, competency);
create index if not exists financial_entries_payment_method_idx
  on public.financial_entries(organization_id, payment_method_id, competency);
create index if not exists financial_entries_status_idx
  on public.financial_entries(organization_id, competency, entry_status);

alter table public.monthly_submissions
  add column if not exists reopen_reason text,
  add column if not exists reopen_count integer not null default 0;

create table if not exists public.simple_control_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  actor_user_id uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  notification_type text not null,
  competency date,
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists simple_control_notifications_created_idx
  on public.simple_control_notifications(created_at desc);
create index if not exists simple_control_notifications_org_idx
  on public.simple_control_notifications(organization_id, created_at desc);

alter table public.finance_customers enable row level security;
alter table public.finance_payment_methods enable row level security;
alter table public.simple_control_notifications enable row level security;

-- Client-facing catalog management for the active organization.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='financial_categories' and policyname='financial_categories_client_insert_v3') then
    create policy financial_categories_client_insert_v3 on public.financial_categories
      for insert to authenticated
      with check (organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='financial_categories' and policyname='financial_categories_client_update_v3') then
    create policy financial_categories_client_update_v3 on public.financial_categories
      for update to authenticated
      using (organization_id = auth.organization_id())
      with check (organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='organization_settings' and policyname='organization_settings_client_update_v3') then
    create policy organization_settings_client_update_v3 on public.organization_settings
      for update to authenticated
      using (organization_id = auth.organization_id())
      with check (organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='monthly_submissions' and policyname='monthly_submissions_client_update_v3') then
    create policy monthly_submissions_client_update_v3 on public.monthly_submissions
      for update to authenticated
      using (organization_id = auth.organization_id())
      with check (organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_events' and policyname='audit_events_client_insert_v3') then
    create policy audit_events_client_insert_v3 on public.audit_events
      for insert to authenticated
      with check (organization_id = auth.organization_id() and actor_user_id = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_customers' and policyname='finance_customers_select_v3') then
    create policy finance_customers_select_v3 on public.finance_customers
      for select to authenticated
      using (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_customers' and policyname='finance_customers_insert_v3') then
    create policy finance_customers_insert_v3 on public.finance_customers
      for insert to authenticated
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_customers' and policyname='finance_customers_update_v3') then
    create policy finance_customers_update_v3 on public.finance_customers
      for update to authenticated
      using (is_super_admin() or organization_id = auth.organization_id())
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_customers' and policyname='finance_customers_delete_v3') then
    create policy finance_customers_delete_v3 on public.finance_customers
      for delete to authenticated
      using (is_super_admin() or organization_id = auth.organization_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_payment_methods' and policyname='finance_payment_methods_select_v3') then
    create policy finance_payment_methods_select_v3 on public.finance_payment_methods
      for select to authenticated
      using (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_payment_methods' and policyname='finance_payment_methods_insert_v3') then
    create policy finance_payment_methods_insert_v3 on public.finance_payment_methods
      for insert to authenticated
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_payment_methods' and policyname='finance_payment_methods_update_v3') then
    create policy finance_payment_methods_update_v3 on public.finance_payment_methods
      for update to authenticated
      using (is_super_admin() or organization_id = auth.organization_id())
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simple_control_notifications' and policyname='simple_control_notifications_select_v3') then
    create policy simple_control_notifications_select_v3 on public.simple_control_notifications
      for select to authenticated
      using (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simple_control_notifications' and policyname='simple_control_notifications_insert_v3') then
    create policy simple_control_notifications_insert_v3 on public.simple_control_notifications
      for insert to authenticated
      with check (is_super_admin() or organization_id = auth.organization_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simple_control_notifications' and policyname='simple_control_notifications_update_v3') then
    create policy simple_control_notifications_update_v3 on public.simple_control_notifications
      for update to authenticated
      using (is_super_admin())
      with check (is_super_admin());
  end if;
end $$;

grant select, insert, update, delete on public.finance_customers to authenticated;
grant select, insert, update on public.finance_payment_methods to authenticated;
grant select, insert, update on public.simple_control_notifications to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant insert on public.audit_events to authenticated;
