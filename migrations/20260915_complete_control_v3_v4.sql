-- Controle Completo V3 + V4
-- V3: edição segura/auditável de obrigações.
-- V4: parcelamentos e recorrências gerando obrigações reais do motor financeiro.

create table if not exists public.finance_obligation_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  obligation_id uuid not null,
  reason text not null,
  before_data jsonb not null,
  after_data jsonb not null,
  changed_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint finance_obligation_revisions_reason_check check (nullif(btrim(reason),'') is not null),
  constraint finance_obligation_revisions_obligation_org_fk
    foreign key (obligation_id, organization_id)
    references public.finance_obligations(id, organization_id) on delete restrict
);
create index if not exists finance_obligation_revisions_obligation_idx
  on public.finance_obligation_revisions(obligation_id, changed_at desc);

create table if not exists public.finance_installment_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  description text not null,
  total_amount numeric(15,2) not null check (total_amount > 0),
  installment_count integer not null check (installment_count between 2 and 120),
  first_due_date date not null,
  issue_date date,
  customer_id uuid,
  supplier_id uuid,
  category_id uuid,
  notes text not null default '',
  status text not null default 'active' check (status in ('active','cancelled','completed')),
  cancelled_at timestamptz,
  cancelled_by uuid references neon_auth."user"(id) on delete set null,
  cancel_reason text,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_installment_plans_v2_description_check check (nullif(btrim(description),'') is not null),
  constraint finance_installment_plans_v2_counterparty_check check (
    (direction='receivable' and supplier_id is null) or
    (direction='payable' and customer_id is null)
  ),
  constraint finance_installment_plans_v2_id_org_uq unique (id, organization_id),
  constraint finance_installment_plans_v2_customer_org_fk
    foreign key (customer_id, organization_id) references public.finance_customers(id, organization_id) on delete restrict,
  constraint finance_installment_plans_v2_supplier_org_fk
    foreign key (supplier_id, organization_id) references public.finance_suppliers(id, organization_id) on delete restrict,
  constraint finance_installment_plans_v2_category_org_fk
    foreign key (category_id, organization_id) references public.financial_categories(id, organization_id) on delete restrict
);
create index if not exists finance_installment_plans_v2_org_idx
  on public.finance_installment_plans_v2(organization_id, status, first_due_date);

create table if not exists public.finance_installment_members_v2 (
  plan_id uuid not null,
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  obligation_id uuid not null,
  installment_no integer not null check (installment_no > 0),
  created_at timestamptz not null default now(),
  primary key (plan_id, installment_no),
  constraint finance_installment_members_v2_plan_org_fk
    foreign key (plan_id, organization_id) references public.finance_installment_plans_v2(id, organization_id) on delete cascade,
  constraint finance_installment_members_v2_obligation_org_fk
    foreign key (obligation_id, organization_id) references public.finance_obligations(id, organization_id) on delete restrict,
  constraint finance_installment_members_v2_obligation_uq unique (obligation_id)
);

create table if not exists public.finance_recurring_rules_v2 (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  direction text not null check (direction in ('receivable','payable')),
  description text not null,
  amount numeric(15,2) not null check (amount > 0),
  due_day integer not null check (due_day between 1 and 31),
  starts_on date not null,
  ends_on date,
  customer_id uuid,
  supplier_id uuid,
  category_id uuid,
  notes text not null default '',
  active boolean not null default true,
  generated_through date,
  stopped_at timestamptz,
  stopped_by uuid references neon_auth."user"(id) on delete set null,
  stop_reason text,
  created_by uuid default auth.uid() references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_recurring_rules_v2_description_check check (nullif(btrim(description),'') is not null),
  constraint finance_recurring_rules_v2_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint finance_recurring_rules_v2_counterparty_check check (
    (direction='receivable' and supplier_id is null) or
    (direction='payable' and customer_id is null)
  ),
  constraint finance_recurring_rules_v2_id_org_uq unique (id, organization_id),
  constraint finance_recurring_rules_v2_customer_org_fk
    foreign key (customer_id, organization_id) references public.finance_customers(id, organization_id) on delete restrict,
  constraint finance_recurring_rules_v2_supplier_org_fk
    foreign key (supplier_id, organization_id) references public.finance_suppliers(id, organization_id) on delete restrict,
  constraint finance_recurring_rules_v2_category_org_fk
    foreign key (category_id, organization_id) references public.financial_categories(id, organization_id) on delete restrict
);
create index if not exists finance_recurring_rules_v2_org_idx
  on public.finance_recurring_rules_v2(organization_id, active, starts_on);

create table if not exists public.finance_recurring_members_v2 (
  recurring_id uuid not null,
  organization_id uuid not null references neon_auth.organization(id) on delete cascade,
  obligation_id uuid not null,
  occurrence_date date not null,
  created_at timestamptz not null default now(),
  primary key (recurring_id, occurrence_date),
  constraint finance_recurring_members_v2_rule_org_fk
    foreign key (recurring_id, organization_id) references public.finance_recurring_rules_v2(id, organization_id) on delete cascade,
  constraint finance_recurring_members_v2_obligation_org_fk
    foreign key (obligation_id, organization_id) references public.finance_obligations(id, organization_id) on delete restrict,
  constraint finance_recurring_members_v2_obligation_uq unique (obligation_id)
);

alter table public.finance_obligation_revisions enable row level security;
alter table public.finance_installment_plans_v2 enable row level security;
alter table public.finance_installment_members_v2 enable row level security;
alter table public.finance_recurring_rules_v2 enable row level security;
alter table public.finance_recurring_members_v2 enable row level security;

drop policy if exists finance_obligation_revisions_select_v1 on public.finance_obligation_revisions;
create policy finance_obligation_revisions_select_v1 on public.finance_obligation_revisions
  for select to authenticated using (public.can_access_organization(organization_id));
drop policy if exists finance_installment_plans_v2_select_v1 on public.finance_installment_plans_v2;
create policy finance_installment_plans_v2_select_v1 on public.finance_installment_plans_v2
  for select to authenticated using (public.can_access_organization(organization_id));
drop policy if exists finance_installment_members_v2_select_v1 on public.finance_installment_members_v2;
create policy finance_installment_members_v2_select_v1 on public.finance_installment_members_v2
  for select to authenticated using (public.can_access_organization(organization_id));
drop policy if exists finance_recurring_rules_v2_select_v1 on public.finance_recurring_rules_v2;
create policy finance_recurring_rules_v2_select_v1 on public.finance_recurring_rules_v2
  for select to authenticated using (public.can_access_organization(organization_id));
drop policy if exists finance_recurring_members_v2_select_v1 on public.finance_recurring_members_v2;
create policy finance_recurring_members_v2_select_v1 on public.finance_recurring_members_v2
  for select to authenticated using (public.can_access_organization(organization_id));

grant select on public.finance_obligation_revisions,
  public.finance_installment_plans_v2, public.finance_installment_members_v2,
  public.finance_recurring_rules_v2, public.finance_recurring_members_v2 to authenticated;
revoke insert, update, delete on public.finance_obligation_revisions,
  public.finance_installment_plans_v2, public.finance_installment_members_v2,
  public.finance_recurring_rules_v2, public.finance_recurring_members_v2 from authenticated;

create or replace function public.finance_v34_due_date(p_month date, p_due_day integer)
returns date
language sql
immutable
set search_path=pg_catalog,public
as $$
  select make_date(
    extract(year from p_month)::integer,
    extract(month from p_month)::integer,
    least(
      greatest(p_due_day,1),
      extract(day from (date_trunc('month',p_month) + interval '1 month - 1 day'))::integer
    )
  );
$$;
revoke all on function public.finance_v34_due_date(date,integer) from public, authenticated;

create or replace function public.update_finance_obligation_safe(
  p_obligation_id uuid,
  p_description text,
  p_issue_date date,
  p_due_date date,
  p_amount numeric,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_category_id uuid,
  p_notes text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_old public.finance_obligations%rowtype;
  v_allocated_other numeric(15,2);
  v_before jsonb;
  v_after jsonb;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo da alteração'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Informe a descrição'; end if;
  if p_due_date is null then raise exception 'Informe o vencimento'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;

  select * into v_old from public.finance_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Obrigação não encontrada'; end if;
  perform public.finance_assert_org_access(v_old.organization_id);
  if v_old.status not in ('open','partial') then raise exception 'Somente obrigações abertas ou parciais podem ser editadas'; end if;
  if p_amount < v_old.settled_amount then raise exception 'O valor não pode ser menor que o total já baixado'; end if;
  if p_issue_date is not null and p_due_date < p_issue_date then raise exception 'O vencimento não pode ser anterior à emissão'; end if;

  if v_old.direction='receivable' and p_supplier_id is not null then raise exception 'Fornecedor não pode ser vinculado a conta a receber'; end if;
  if v_old.direction='payable' and p_customer_id is not null then raise exception 'Cliente não pode ser vinculado a conta a pagar'; end if;

  if p_customer_id is not null and not exists(
    select 1 from public.finance_customers where id=p_customer_id and organization_id=v_old.organization_id
  ) then raise exception 'Cliente não pertence à empresa'; end if;
  if p_supplier_id is not null and not exists(
    select 1 from public.finance_suppliers where id=p_supplier_id and organization_id=v_old.organization_id
  ) then raise exception 'Fornecedor não pertence à empresa'; end if;
  if p_category_id is not null and not exists(
    select 1 from public.financial_categories
    where id=p_category_id and organization_id=v_old.organization_id
      and type=case when v_old.direction='receivable' then 'revenue' else 'expense' end
  ) then raise exception 'Categoria incompatível com a obrigação'; end if;

  if v_old.financial_entry_id is not null then
    select coalesce(sum(case when status='cancelled' then settled_amount else original_amount end),0)
      into v_allocated_other
    from public.finance_obligations
    where financial_entry_id=v_old.financial_entry_id and id<>v_old.id;
    if v_allocated_other + p_amount > (select amount from public.financial_entries where id=v_old.financial_entry_id) then
      raise exception 'O novo valor excede o saldo disponível do lançamento de competência';
    end if;
  end if;

  v_before:=to_jsonb(v_old);

  update public.finance_obligations
  set description=btrim(p_description),
      issue_date=p_issue_date,
      due_date=p_due_date,
      original_amount=p_amount,
      customer_id=case when direction='receivable' then p_customer_id else null end,
      supplier_id=case when direction='payable' then p_supplier_id else null end,
      category_id=p_category_id,
      notes=coalesce(p_notes,''),
      status=case when p_amount=settled_amount and settled_amount>0 then 'settled' when settled_amount>0 then 'partial' else 'open' end,
      updated_at=now()
  where id=v_old.id;

  select to_jsonb(o) into v_after from public.finance_obligations o where o.id=v_old.id;
  insert into public.finance_obligation_revisions(organization_id,obligation_id,reason,before_data,after_data,changed_by)
  values(v_old.organization_id,v_old.id,btrim(p_reason),v_before,v_after,auth.uid());
end;
$$;

create or replace function public.create_finance_installment_plan_v2(
  p_organization_id uuid,
  p_direction text,
  p_description text,
  p_total_amount numeric,
  p_installment_count integer,
  p_issue_date date,
  p_first_due_date date,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_category_id uuid,
  p_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_plan_id uuid;
  v_obligation_id uuid;
  v_total_cents bigint;
  v_base_cents bigint;
  v_remainder bigint;
  v_cents bigint;
  v_due date;
  i integer;
begin
  perform public.finance_assert_org_access(p_organization_id);
  if p_direction not in ('receivable','payable') then raise exception 'Direção inválida'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Informe a descrição'; end if;
  if coalesce(p_total_amount,0)<=0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_installment_count is null or p_installment_count<2 or p_installment_count>120 then raise exception 'Quantidade de parcelas deve ficar entre 2 e 120'; end if;
  if p_first_due_date is null then raise exception 'Informe o primeiro vencimento'; end if;
  if p_issue_date is not null and p_first_due_date<p_issue_date then raise exception 'O primeiro vencimento não pode ser anterior à emissão'; end if;
  if p_direction='receivable' and p_supplier_id is not null then raise exception 'Fornecedor incompatível com conta a receber'; end if;
  if p_direction='payable' and p_customer_id is not null then raise exception 'Cliente incompatível com conta a pagar'; end if;
  if p_customer_id is not null and not exists(select 1 from public.finance_customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Cliente não pertence à empresa'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.finance_suppliers where id=p_supplier_id and organization_id=p_organization_id) then raise exception 'Fornecedor não pertence à empresa'; end if;
  if p_category_id is not null and not exists(select 1 from public.financial_categories where id=p_category_id and organization_id=p_organization_id and type=case when p_direction='receivable' then 'revenue' else 'expense' end) then raise exception 'Categoria incompatível'; end if;

  insert into public.finance_installment_plans_v2(
    organization_id,direction,description,total_amount,installment_count,first_due_date,issue_date,
    customer_id,supplier_id,category_id,notes,created_by
  ) values(
    p_organization_id,p_direction,btrim(p_description),p_total_amount,p_installment_count,p_first_due_date,p_issue_date,
    case when p_direction='receivable' then p_customer_id else null end,
    case when p_direction='payable' then p_supplier_id else null end,
    p_category_id,coalesce(p_notes,''),auth.uid()
  ) returning id into v_plan_id;

  v_total_cents:=round(p_total_amount*100)::bigint;
  v_base_cents:=v_total_cents/p_installment_count;
  v_remainder:=mod(v_total_cents,p_installment_count);

  for i in 1..p_installment_count loop
    v_cents:=v_base_cents + case when i<=v_remainder then 1 else 0 end;
    v_due:=(p_first_due_date + make_interval(months=>i-1))::date;
    insert into public.finance_obligations(
      organization_id,direction,origin,customer_id,supplier_id,category_id,description,issue_date,due_date,
      original_amount,settled_amount,status,notes,created_by,updated_at
    ) values(
      p_organization_id,p_direction,'manual',
      case when p_direction='receivable' then p_customer_id else null end,
      case when p_direction='payable' then p_supplier_id else null end,
      p_category_id,btrim(p_description)||' • '||i||'/'||p_installment_count,p_issue_date,v_due,
      v_cents/100.0,0,'open',coalesce(p_notes,''),auth.uid(),now()
    ) returning id into v_obligation_id;
    insert into public.finance_installment_members_v2(plan_id,organization_id,obligation_id,installment_no)
    values(v_plan_id,p_organization_id,v_obligation_id,i);
  end loop;

  return v_plan_id;
end;
$$;

create or replace function public.cancel_finance_installment_remaining_v2(
  p_plan_id uuid,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_plan public.finance_installment_plans_v2%rowtype;
  v_count integer;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo'; end if;
  select * into v_plan from public.finance_installment_plans_v2 where id=p_plan_id for update;
  if not found then raise exception 'Parcelamento não encontrado'; end if;
  perform public.finance_assert_org_access(v_plan.organization_id);

  update public.finance_obligations o
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now()
  from public.finance_installment_members_v2 m
  where m.plan_id=v_plan.id and m.obligation_id=o.id and o.status in ('open','partial');
  get diagnostics v_count=row_count;

  update public.finance_installment_plans_v2
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now()
  where id=v_plan.id;
  return v_count;
end;
$$;

create or replace function public.generate_finance_recurring_v2(
  p_rule_id uuid,
  p_through date
) returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_rule public.finance_recurring_rules_v2%rowtype;
  v_month date;
  v_last_month date;
  v_due date;
  v_obligation_id uuid;
  v_count integer:=0;
begin
  if p_through is null then raise exception 'Informe até quando gerar'; end if;
  select * into v_rule from public.finance_recurring_rules_v2 where id=p_rule_id for update;
  if not found then raise exception 'Recorrência não encontrada'; end if;
  perform public.finance_assert_org_access(v_rule.organization_id);
  if not v_rule.active then raise exception 'A recorrência está encerrada'; end if;

  v_month:=date_trunc('month',coalesce(v_rule.generated_through,v_rule.starts_on))::date;
  if v_rule.generated_through is not null then v_month:=(v_month+interval '1 month')::date; end if;
  v_last_month:=date_trunc('month',least(p_through,coalesce(v_rule.ends_on,p_through)))::date;

  while v_month<=v_last_month loop
    v_due:=public.finance_v34_due_date(v_month,v_rule.due_day);
    if v_due>=v_rule.starts_on and (v_rule.ends_on is null or v_due<=v_rule.ends_on) then
      insert into public.finance_obligations(
        organization_id,direction,origin,customer_id,supplier_id,category_id,description,issue_date,due_date,
        original_amount,settled_amount,status,notes,created_by,updated_at
      ) values(
        v_rule.organization_id,v_rule.direction,'manual',v_rule.customer_id,v_rule.supplier_id,v_rule.category_id,
        v_rule.description,v_due,v_due,v_rule.amount,0,'open',v_rule.notes,auth.uid(),now()
      ) returning id into v_obligation_id;
      insert into public.finance_recurring_members_v2(recurring_id,organization_id,obligation_id,occurrence_date)
      values(v_rule.id,v_rule.organization_id,v_obligation_id,v_due)
      on conflict (recurring_id,occurrence_date) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;
    v_month:=(v_month+interval '1 month')::date;
  end loop;

  update public.finance_recurring_rules_v2
  set generated_through=greatest(coalesce(generated_through,starts_on),least(p_through,coalesce(ends_on,p_through))),updated_at=now()
  where id=v_rule.id;
  return v_count;
end;
$$;

create or replace function public.create_finance_recurring_rule_v2(
  p_organization_id uuid,
  p_direction text,
  p_description text,
  p_amount numeric,
  p_due_day integer,
  p_starts_on date,
  p_ends_on date,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_category_id uuid,
  p_notes text default '',
  p_generate_months integer default 12
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_id uuid;
  v_through date;
begin
  perform public.finance_assert_org_access(p_organization_id);
  if p_direction not in ('receivable','payable') then raise exception 'Direção inválida'; end if;
  if nullif(btrim(coalesce(p_description,'')),'') is null then raise exception 'Informe a descrição'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_due_day is null or p_due_day<1 or p_due_day>31 then raise exception 'Dia de vencimento inválido'; end if;
  if p_starts_on is null then raise exception 'Informe a data inicial'; end if;
  if p_ends_on is not null and p_ends_on<p_starts_on then raise exception 'Data final inválida'; end if;
  if coalesce(p_generate_months,12)<1 or coalesce(p_generate_months,12)>36 then raise exception 'Horizonte inicial deve ficar entre 1 e 36 meses'; end if;
  if p_direction='receivable' and p_supplier_id is not null then raise exception 'Fornecedor incompatível'; end if;
  if p_direction='payable' and p_customer_id is not null then raise exception 'Cliente incompatível'; end if;
  if p_customer_id is not null and not exists(select 1 from public.finance_customers where id=p_customer_id and organization_id=p_organization_id) then raise exception 'Cliente não pertence à empresa'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.finance_suppliers where id=p_supplier_id and organization_id=p_organization_id) then raise exception 'Fornecedor não pertence à empresa'; end if;
  if p_category_id is not null and not exists(select 1 from public.financial_categories where id=p_category_id and organization_id=p_organization_id and type=case when p_direction='receivable' then 'revenue' else 'expense' end) then raise exception 'Categoria incompatível'; end if;

  insert into public.finance_recurring_rules_v2(
    organization_id,direction,description,amount,due_day,starts_on,ends_on,customer_id,supplier_id,category_id,notes,created_by
  ) values(
    p_organization_id,p_direction,btrim(p_description),p_amount,p_due_day,p_starts_on,p_ends_on,
    case when p_direction='receivable' then p_customer_id else null end,
    case when p_direction='payable' then p_supplier_id else null end,
    p_category_id,coalesce(p_notes,''),auth.uid()
  ) returning id into v_id;

  v_through:=(date_trunc('month',p_starts_on) + make_interval(months=>coalesce(p_generate_months,12)-1) + interval '1 month - 1 day')::date;
  if p_ends_on is not null then v_through:=least(v_through,p_ends_on); end if;
  perform public.generate_finance_recurring_v2(v_id,v_through);
  return v_id;
end;
$$;

create or replace function public.stop_finance_recurring_rule_v2(
  p_rule_id uuid,
  p_cancel_future boolean,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_rule public.finance_recurring_rules_v2%rowtype;
  v_count integer:=0;
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Informe o motivo'; end if;
  select * into v_rule from public.finance_recurring_rules_v2 where id=p_rule_id for update;
  if not found then raise exception 'Recorrência não encontrada'; end if;
  perform public.finance_assert_org_access(v_rule.organization_id);

  update public.finance_recurring_rules_v2
  set active=false,stopped_at=now(),stopped_by=auth.uid(),stop_reason=btrim(p_reason),updated_at=now()
  where id=v_rule.id;

  if coalesce(p_cancel_future,false) then
    update public.finance_obligations o
    set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason='Recorrência encerrada: '||btrim(p_reason),updated_at=now()
    from public.finance_recurring_members_v2 m
    where m.recurring_id=v_rule.id and m.obligation_id=o.id and o.status='open' and o.due_date>=current_date;
    get diagnostics v_count=row_count;
  end if;
  return v_count;
end;
$$;

revoke all on function public.update_finance_obligation_safe(uuid,text,date,date,numeric,uuid,uuid,uuid,text,text) from public;
grant execute on function public.update_finance_obligation_safe(uuid,text,date,date,numeric,uuid,uuid,uuid,text,text) to authenticated;
revoke all on function public.create_finance_installment_plan_v2(uuid,text,text,numeric,integer,date,date,uuid,uuid,uuid,text) from public;
grant execute on function public.create_finance_installment_plan_v2(uuid,text,text,numeric,integer,date,date,uuid,uuid,uuid,text) to authenticated;
revoke all on function public.cancel_finance_installment_remaining_v2(uuid,text) from public;
grant execute on function public.cancel_finance_installment_remaining_v2(uuid,text) to authenticated;
revoke all on function public.generate_finance_recurring_v2(uuid,date) from public;
grant execute on function public.generate_finance_recurring_v2(uuid,date) to authenticated;
revoke all on function public.create_finance_recurring_rule_v2(uuid,text,text,numeric,integer,date,date,uuid,uuid,uuid,text,integer) from public;
grant execute on function public.create_finance_recurring_rule_v2(uuid,text,text,numeric,integer,date,date,uuid,uuid,uuid,text,integer) to authenticated;
revoke all on function public.stop_finance_recurring_rule_v2(uuid,boolean,text) from public;
grant execute on function public.stop_finance_recurring_rule_v2(uuid,boolean,text) to authenticated;
