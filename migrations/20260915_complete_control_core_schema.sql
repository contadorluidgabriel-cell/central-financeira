-- Controle Completo — Fase 1
-- Camadas: competência (financial_entries), obrigações, baixas e caixa.

create unique index if not exists financial_entries_id_org_uq
  on public.financial_entries(id, organization_id);
create unique index if not exists finance_customers_id_org_uq
  on public.finance_customers(id, organization_id);
create unique index if not exists finance_suppliers_id_org_uq
  on public.finance_suppliers(id, organization_id);
create unique index if not exists financial_categories_id_org_uq
  on public.financial_categories(id, organization_id);

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  name text not null,
  kind text not null default 'bank' check (kind in ('bank','cash','wallet','other')),
  institution text,
  opening_balance numeric(15,2) not null default 0,
  opening_date date not null,
  active boolean not null default true,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_accounts_name_not_blank check (btrim(name) <> ''),
  constraint finance_accounts_id_org_uq unique (id, organization_id)
);

create unique index if not exists finance_accounts_org_name_uq
  on public.finance_accounts(organization_id, lower(btrim(name)))
  where active;

create table if not exists public.finance_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  origin text not null default 'manual' check (origin in ('manual','financial_entry','opening')),
  financial_entry_id uuid,
  customer_id uuid,
  supplier_id uuid,
  category_id uuid,
  description text not null,
  issue_date date,
  due_date date not null,
  original_amount numeric(15,2) not null check (original_amount > 0),
  settled_amount numeric(15,2) not null default 0 check (settled_amount >= 0 and settled_amount <= original_amount),
  status text not null default 'open' check (status in ('open','partial','settled','cancelled')),
  notes text not null default '',
  cancelled_at timestamptz,
  cancelled_by uuid references neon_auth."user"(id) on delete set null,
  cancel_reason text,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_obligations_description_not_blank check (btrim(description) <> ''),
  constraint finance_obligations_entry_origin_check check (
    (origin = 'financial_entry' and financial_entry_id is not null)
    or (origin <> 'financial_entry' and financial_entry_id is null)
  ),
  constraint finance_obligations_counterparty_check check (
    (direction = 'receivable' and supplier_id is null)
    or (direction = 'payable' and customer_id is null)
  ),
  constraint finance_obligations_cancel_check check (
    (status = 'cancelled' and cancelled_at is not null and nullif(btrim(coalesce(cancel_reason,'')), '') is not null)
    or status <> 'cancelled'
  ),
  constraint finance_obligations_id_org_uq unique (id, organization_id),
  constraint finance_obligations_entry_org_fk
    foreign key (financial_entry_id, organization_id)
    references public.financial_entries(id, organization_id) on delete restrict,
  constraint finance_obligations_customer_org_fk
    foreign key (customer_id, organization_id)
    references public.finance_customers(id, organization_id) on delete restrict,
  constraint finance_obligations_supplier_org_fk
    foreign key (supplier_id, organization_id)
    references public.finance_suppliers(id, organization_id) on delete restrict,
  constraint finance_obligations_category_org_fk
    foreign key (category_id, organization_id)
    references public.financial_categories(id, organization_id) on delete restrict
);

create index if not exists finance_obligations_org_due_idx
  on public.finance_obligations(organization_id, due_date);
create index if not exists finance_obligations_org_status_idx
  on public.finance_obligations(organization_id, status, direction);
create index if not exists finance_obligations_entry_idx
  on public.finance_obligations(financial_entry_id)
  where financial_entry_id is not null;

create table if not exists public.finance_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  obligation_id uuid not null,
  account_id uuid not null,
  settled_on date not null,
  amount numeric(15,2) not null check (amount > 0),
  notes text not null default '',
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references neon_auth."user"(id) on delete set null,
  reverse_reason text,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_settlements_reverse_check check (
    (status = 'reversed' and reversed_at is not null and nullif(btrim(coalesce(reverse_reason,'')), '') is not null)
    or status = 'active'
  ),
  constraint finance_settlements_id_org_uq unique (id, organization_id),
  constraint finance_settlements_obligation_org_fk
    foreign key (obligation_id, organization_id)
    references public.finance_obligations(id, organization_id) on delete restrict,
  constraint finance_settlements_account_org_fk
    foreign key (account_id, organization_id)
    references public.finance_accounts(id, organization_id) on delete restrict
);

create index if not exists finance_settlements_obligation_idx
  on public.finance_settlements(obligation_id, status);
create index if not exists finance_settlements_account_date_idx
  on public.finance_settlements(account_id, settled_on);

create table if not exists public.finance_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  transferred_on date not null,
  amount numeric(15,2) not null check (amount > 0),
  description text not null default 'Transferência entre contas',
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references neon_auth."user"(id) on delete set null,
  reverse_reason text,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_transfers_accounts_different check (from_account_id <> to_account_id),
  constraint finance_transfers_reverse_check check (
    (status = 'reversed' and reversed_at is not null and nullif(btrim(coalesce(reverse_reason,'')), '') is not null)
    or status = 'active'
  ),
  constraint finance_transfers_id_org_uq unique (id, organization_id),
  constraint finance_transfers_from_org_fk
    foreign key (from_account_id, organization_id)
    references public.finance_accounts(id, organization_id) on delete restrict,
  constraint finance_transfers_to_org_fk
    foreign key (to_account_id, organization_id)
    references public.finance_accounts(id, organization_id) on delete restrict
);

create index if not exists finance_transfers_org_date_idx
  on public.finance_transfers(organization_id, transferred_on);

create table if not exists public.finance_cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  account_id uuid not null,
  occurred_on date not null,
  direction text not null check (direction in ('in','out')),
  amount numeric(15,2) not null check (amount > 0),
  description text not null default '',
  movement_kind text not null check (movement_kind in (
    'settlement','settlement_reversal',
    'transfer_in','transfer_out',
    'transfer_reversal_in','transfer_reversal_out'
  )),
  settlement_id uuid,
  transfer_id uuid,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_cash_movements_source_check check (
    ((movement_kind in ('settlement','settlement_reversal')) and settlement_id is not null and transfer_id is null)
    or
    ((movement_kind in ('transfer_in','transfer_out','transfer_reversal_in','transfer_reversal_out')) and transfer_id is not null and settlement_id is null)
  ),
  constraint finance_cash_movements_account_org_fk
    foreign key (account_id, organization_id)
    references public.finance_accounts(id, organization_id) on delete restrict,
  constraint finance_cash_movements_settlement_org_fk
    foreign key (settlement_id, organization_id)
    references public.finance_settlements(id, organization_id) on delete restrict,
  constraint finance_cash_movements_transfer_org_fk
    foreign key (transfer_id, organization_id)
    references public.finance_transfers(id, organization_id) on delete restrict
);

create unique index if not exists finance_cash_movement_settlement_kind_uq
  on public.finance_cash_movements(settlement_id, movement_kind)
  where settlement_id is not null;
create unique index if not exists finance_cash_movement_transfer_kind_uq
  on public.finance_cash_movements(transfer_id, movement_kind)
  where transfer_id is not null;
create index if not exists finance_cash_movements_account_date_idx
  on public.finance_cash_movements(account_id, occurred_on);

alter table public.finance_accounts enable row level security;
alter table public.finance_obligations enable row level security;
alter table public.finance_settlements enable row level security;
alter table public.finance_transfers enable row level security;
alter table public.finance_cash_movements enable row level security;

drop policy if exists finance_accounts_select_v1 on public.finance_accounts;
create policy finance_accounts_select_v1 on public.finance_accounts
  for select to authenticated
  using (public.can_access_organization(organization_id));

drop policy if exists finance_obligations_select_v1 on public.finance_obligations;
create policy finance_obligations_select_v1 on public.finance_obligations
  for select to authenticated
  using (public.can_access_organization(organization_id));

drop policy if exists finance_settlements_select_v1 on public.finance_settlements;
create policy finance_settlements_select_v1 on public.finance_settlements
  for select to authenticated
  using (public.can_access_organization(organization_id));

drop policy if exists finance_transfers_select_v1 on public.finance_transfers;
create policy finance_transfers_select_v1 on public.finance_transfers
  for select to authenticated
  using (public.can_access_organization(organization_id));

drop policy if exists finance_cash_movements_select_v1 on public.finance_cash_movements;
create policy finance_cash_movements_select_v1 on public.finance_cash_movements
  for select to authenticated
  using (public.can_access_organization(organization_id));

grant select on public.finance_accounts,
  public.finance_obligations,
  public.finance_settlements,
  public.finance_transfers,
  public.finance_cash_movements to authenticated;

revoke insert, update, delete on public.finance_accounts,
  public.finance_obligations,
  public.finance_settlements,
  public.finance_transfers,
  public.finance_cash_movements from authenticated;

alter table public.organization_settings
  drop constraint if exists organization_settings_control_tier_check;
alter table public.organization_settings
  add constraint organization_settings_control_tier_check
  check (control_tier in ('unconfigured','simple','basic','complete'));

alter table public.organization_settings
  drop constraint if exists organization_settings_pending_control_tier_check;
alter table public.organization_settings
  add constraint organization_settings_pending_control_tier_check
  check (pending_control_tier is null or pending_control_tier in ('simple','basic','complete'));
