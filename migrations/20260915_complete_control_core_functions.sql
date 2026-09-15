-- Controle Completo — funções transacionais e integração de nível.

create or replace function public.finance_assert_org_access(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.can_access_organization(p_organization_id) then
    raise exception 'Acesso negado à empresa';
  end if;
end;
$$;
revoke all on function public.finance_assert_org_access(uuid) from public, authenticated;

create or replace function public.create_finance_account(
  p_organization_id uuid,
  p_name text,
  p_kind text,
  p_institution text,
  p_opening_balance numeric,
  p_opening_date date
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_id uuid;
begin
  perform public.finance_assert_org_access(p_organization_id);
  if nullif(btrim(coalesce(p_name,'')), '') is null then raise exception 'Informe o nome da conta'; end if;
  if coalesce(p_kind,'') not in ('bank','cash','wallet','other') then raise exception 'Tipo de conta inválido'; end if;
  if p_opening_date is null then raise exception 'Informe a data do saldo inicial'; end if;

  insert into public.finance_accounts(
    organization_id,name,kind,institution,opening_balance,opening_date,active,created_by,updated_at
  ) values (
    p_organization_id,btrim(p_name),p_kind,nullif(btrim(coalesce(p_institution,'')),''),
    coalesce(p_opening_balance,0),p_opening_date,true,auth.uid(),now()
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_finance_account(
  p_account_id uuid,
  p_name text,
  p_kind text,
  p_institution text,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.finance_accounts where id=p_account_id;
  if v_org is null then raise exception 'Conta financeira não encontrada'; end if;
  perform public.finance_assert_org_access(v_org);
  if nullif(btrim(coalesce(p_name,'')), '') is null then raise exception 'Informe o nome da conta'; end if;
  if coalesce(p_kind,'') not in ('bank','cash','wallet','other') then raise exception 'Tipo de conta inválido'; end if;

  update public.finance_accounts
  set name=btrim(p_name),
      kind=p_kind,
      institution=nullif(btrim(coalesce(p_institution,'')),''),
      active=coalesce(p_active,true),
      updated_at=now()
  where id=p_account_id;
end;
$$;

create or replace function public.create_finance_obligation(
  p_organization_id uuid,
  p_direction text,
  p_origin text,
  p_financial_entry_id uuid,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_category_id uuid,
  p_description text,
  p_issue_date date,
  p_due_date date,
  p_amount numeric,
  p_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_id uuid;
  v_direction text := p_direction;
  v_entry public.financial_entries%rowtype;
  v_allocated numeric(15,2);
  v_description text := nullif(btrim(coalesce(p_description,'')), '');
  v_issue_date date := p_issue_date;
  v_customer_id uuid := p_customer_id;
  v_supplier_id uuid := p_supplier_id;
  v_category_id uuid := p_category_id;
begin
  perform public.finance_assert_org_access(p_organization_id);
  if coalesce(p_origin,'') not in ('manual','financial_entry','opening') then raise exception 'Origem da obrigação inválida'; end if;
  if p_due_date is null then raise exception 'Informe o vencimento'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;

  if p_origin='financial_entry' then
    if p_financial_entry_id is null then raise exception 'Informe o lançamento de origem'; end if;
    select * into v_entry
    from public.financial_entries
    where id=p_financial_entry_id and organization_id=p_organization_id
    for update;
    if not found then raise exception 'Lançamento financeiro não encontrado para esta empresa'; end if;
    if v_entry.entry_status <> 'active' then raise exception 'A obrigação só pode ser vinculada a um lançamento ativo'; end if;

    v_direction := case v_entry.type when 'revenue' then 'receivable' when 'expense' then 'payable' else null end;
    if v_direction is null then raise exception 'Tipo de lançamento incompatível com obrigação'; end if;

    select coalesce(sum(case when status='cancelled' then settled_amount else original_amount end),0)
      into v_allocated
    from public.finance_obligations
    where financial_entry_id=p_financial_entry_id;

    if v_allocated + p_amount > v_entry.amount then
      raise exception 'O valor vinculado excede o valor disponível do lançamento';
    end if;

    v_customer_id := case when v_direction='receivable' then v_entry.customer_id else null end;
    v_supplier_id := case when v_direction='payable' then v_entry.supplier_id else null end;
    v_category_id := v_entry.category_id;
    v_description := coalesce(
      v_description,
      nullif(btrim(v_entry.description),''),
      case when v_direction='receivable' then 'Conta a receber' else 'Conta a pagar' end
    );
    v_issue_date := coalesce(v_issue_date, v_entry.occurred_on, v_entry.competency);
  else
    if p_financial_entry_id is not null then
      raise exception 'Lançamento de origem só é permitido para obrigações originadas de financial_entry';
    end if;
  end if;

  if coalesce(v_direction,'') not in ('receivable','payable') then raise exception 'Direção da obrigação inválida'; end if;
  if v_issue_date is not null and p_due_date < v_issue_date then raise exception 'O vencimento não pode ser anterior à emissão'; end if;
  if v_direction='receivable' and v_supplier_id is not null then raise exception 'Fornecedor não pode ser vinculado a uma conta a receber'; end if;
  if v_direction='payable' and v_customer_id is not null then raise exception 'Cliente não pode ser vinculado a uma conta a pagar'; end if;

  if v_customer_id is not null and not exists(
    select 1 from public.finance_customers where id=v_customer_id and organization_id=p_organization_id
  ) then raise exception 'Cliente não pertence à empresa'; end if;

  if v_supplier_id is not null and not exists(
    select 1 from public.finance_suppliers where id=v_supplier_id and organization_id=p_organization_id
  ) then raise exception 'Fornecedor não pertence à empresa'; end if;

  if v_category_id is not null and not exists(
    select 1 from public.financial_categories
    where id=v_category_id
      and organization_id=p_organization_id
      and type=case when v_direction='receivable' then 'revenue' else 'expense' end
  ) then raise exception 'Categoria incompatível com a empresa ou com o tipo da obrigação'; end if;

  if v_description is null then raise exception 'Informe a descrição'; end if;

  insert into public.finance_obligations(
    organization_id,direction,origin,financial_entry_id,customer_id,supplier_id,category_id,
    description,issue_date,due_date,original_amount,settled_amount,status,notes,created_by,updated_at
  ) values (
    p_organization_id,v_direction,p_origin,p_financial_entry_id,v_customer_id,v_supplier_id,v_category_id,
    v_description,v_issue_date,p_due_date,p_amount,0,'open',coalesce(p_notes,''),auth.uid(),now()
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.settle_finance_obligation(
  p_obligation_id uuid,
  p_account_id uuid,
  p_settled_on date,
  p_amount numeric,
  p_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_obligation public.finance_obligations%rowtype;
  v_account public.finance_accounts%rowtype;
  v_settlement_id uuid;
  v_remaining numeric(15,2);
  v_direction text;
begin
  if p_settled_on is null then raise exception 'Informe a data da baixa'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;

  select * into v_obligation from public.finance_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Obrigação não encontrada'; end if;
  perform public.finance_assert_org_access(v_obligation.organization_id);
  if v_obligation.status not in ('open','partial') then raise exception 'A obrigação não está aberta para baixa'; end if;

  v_remaining := v_obligation.original_amount - v_obligation.settled_amount;
  if p_amount > v_remaining then raise exception 'O valor da baixa excede o saldo em aberto'; end if;

  select * into v_account
  from public.finance_accounts
  where id=p_account_id and organization_id=v_obligation.organization_id
  for share;
  if not found then raise exception 'Conta financeira não encontrada para esta empresa'; end if;
  if not v_account.active then raise exception 'A conta financeira está inativa'; end if;
  if p_settled_on < v_account.opening_date then raise exception 'A baixa não pode ser anterior à data de abertura da conta'; end if;

  insert into public.finance_settlements(
    organization_id,obligation_id,account_id,settled_on,amount,notes,status,created_by
  ) values (
    v_obligation.organization_id,v_obligation.id,v_account.id,p_settled_on,p_amount,coalesce(p_notes,''),'active',auth.uid()
  ) returning id into v_settlement_id;

  v_direction := case when v_obligation.direction='receivable' then 'in' else 'out' end;

  insert into public.finance_cash_movements(
    organization_id,account_id,occurred_on,direction,amount,description,movement_kind,settlement_id,created_by
  ) values (
    v_obligation.organization_id,v_account.id,p_settled_on,v_direction,p_amount,
    (case when v_obligation.direction='receivable' then 'Recebimento • ' else 'Pagamento • ' end)||v_obligation.description,
    'settlement',v_settlement_id,auth.uid()
  );

  update public.finance_obligations
  set settled_amount=settled_amount+p_amount,
      status=case when settled_amount+p_amount >= original_amount then 'settled' else 'partial' end,
      updated_at=now()
  where id=v_obligation.id;

  return v_settlement_id;
end;
$$;

create or replace function public.reverse_finance_settlement(
  p_settlement_id uuid,
  p_reversed_on date,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_settlement public.finance_settlements%rowtype;
  v_obligation public.finance_obligations%rowtype;
  v_reverse_direction text;
begin
  if p_reversed_on is null then raise exception 'Informe a data do estorno'; end if;
  if nullif(btrim(coalesce(p_reason,'')), '') is null then raise exception 'Informe o motivo do estorno'; end if;

  select * into v_settlement from public.finance_settlements where id=p_settlement_id for update;
  if not found then raise exception 'Baixa não encontrada'; end if;
  perform public.finance_assert_org_access(v_settlement.organization_id);
  if v_settlement.status <> 'active' then raise exception 'Esta baixa já foi estornada'; end if;
  if p_reversed_on < v_settlement.settled_on then raise exception 'O estorno não pode ser anterior à baixa original'; end if;

  select * into v_obligation from public.finance_obligations where id=v_settlement.obligation_id for update;
  if not found then raise exception 'Obrigação vinculada não encontrada'; end if;

  update public.finance_settlements
  set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reverse_reason=btrim(p_reason)
  where id=v_settlement.id;

  v_reverse_direction := case when v_obligation.direction='receivable' then 'out' else 'in' end;

  insert into public.finance_cash_movements(
    organization_id,account_id,occurred_on,direction,amount,description,movement_kind,settlement_id,created_by
  ) values (
    v_settlement.organization_id,v_settlement.account_id,p_reversed_on,v_reverse_direction,v_settlement.amount,
    'Estorno • '||v_obligation.description,'settlement_reversal',v_settlement.id,auth.uid()
  );

  update public.finance_obligations
  set settled_amount=greatest(0,settled_amount-v_settlement.amount),
      status=case
        when status='cancelled' then 'cancelled'
        when greatest(0,settled_amount-v_settlement.amount)=0 then 'open'
        else 'partial'
      end,
      updated_at=now()
  where id=v_obligation.id;
end;
$$;

create or replace function public.cancel_finance_obligation(
  p_obligation_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_obligation public.finance_obligations%rowtype;
begin
  if nullif(btrim(coalesce(p_reason,'')), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into v_obligation from public.finance_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Obrigação não encontrada'; end if;
  perform public.finance_assert_org_access(v_obligation.organization_id);
  if v_obligation.status='cancelled' then raise exception 'A obrigação já está cancelada'; end if;
  if v_obligation.status='settled' then raise exception 'Uma obrigação totalmente quitada não pode ser cancelada; estorne a baixa primeiro'; end if;

  update public.finance_obligations
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=btrim(p_reason),updated_at=now()
  where id=v_obligation.id;
end;
$$;

create or replace function public.create_finance_transfer(
  p_organization_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_transferred_on date,
  p_amount numeric,
  p_description text default 'Transferência entre contas'
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_transfer_id uuid;
  v_from public.finance_accounts%rowtype;
  v_to public.finance_accounts%rowtype;
  v_description text;
begin
  perform public.finance_assert_org_access(p_organization_id);
  if p_from_account_id is null or p_to_account_id is null or p_from_account_id=p_to_account_id then raise exception 'Escolha contas diferentes'; end if;
  if p_transferred_on is null then raise exception 'Informe a data da transferência'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;

  select * into v_from from public.finance_accounts where id=p_from_account_id and organization_id=p_organization_id for share;
  select * into v_to from public.finance_accounts where id=p_to_account_id and organization_id=p_organization_id for share;
  if v_from.id is null or v_to.id is null then raise exception 'Uma ou mais contas não pertencem à empresa'; end if;
  if not v_from.active or not v_to.active then raise exception 'Uma ou mais contas estão inativas'; end if;
  if p_transferred_on < greatest(v_from.opening_date,v_to.opening_date) then raise exception 'A transferência não pode ser anterior à abertura das contas'; end if;

  v_description:=coalesce(nullif(btrim(coalesce(p_description,'')),''),'Transferência entre contas');

  insert into public.finance_transfers(
    organization_id,from_account_id,to_account_id,transferred_on,amount,description,status,created_by
  ) values (
    p_organization_id,p_from_account_id,p_to_account_id,p_transferred_on,p_amount,v_description,'active',auth.uid()
  ) returning id into v_transfer_id;

  insert into public.finance_cash_movements(
    organization_id,account_id,occurred_on,direction,amount,description,movement_kind,transfer_id,created_by
  ) values
    (p_organization_id,p_from_account_id,p_transferred_on,'out',p_amount,v_description,'transfer_out',v_transfer_id,auth.uid()),
    (p_organization_id,p_to_account_id,p_transferred_on,'in',p_amount,v_description,'transfer_in',v_transfer_id,auth.uid());

  return v_transfer_id;
end;
$$;

create or replace function public.reverse_finance_transfer(
  p_transfer_id uuid,
  p_reversed_on date,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare v_transfer public.finance_transfers%rowtype;
begin
  if p_reversed_on is null then raise exception 'Informe a data do estorno'; end if;
  if nullif(btrim(coalesce(p_reason,'')), '') is null then raise exception 'Informe o motivo do estorno'; end if;

  select * into v_transfer from public.finance_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Transferência não encontrada'; end if;
  perform public.finance_assert_org_access(v_transfer.organization_id);
  if v_transfer.status <> 'active' then raise exception 'Esta transferência já foi estornada'; end if;
  if p_reversed_on < v_transfer.transferred_on then raise exception 'O estorno não pode ser anterior à transferência original'; end if;

  update public.finance_transfers
  set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reverse_reason=btrim(p_reason)
  where id=v_transfer.id;

  insert into public.finance_cash_movements(
    organization_id,account_id,occurred_on,direction,amount,description,movement_kind,transfer_id,created_by
  ) values
    (v_transfer.organization_id,v_transfer.from_account_id,p_reversed_on,'in',v_transfer.amount,'Estorno • '||v_transfer.description,'transfer_reversal_in',v_transfer.id,auth.uid()),
    (v_transfer.organization_id,v_transfer.to_account_id,p_reversed_on,'out',v_transfer.amount,'Estorno • '||v_transfer.description,'transfer_reversal_out',v_transfer.id,auth.uid());
end;
$$;

revoke all on function public.create_finance_account(uuid,text,text,text,numeric,date) from public;
grant execute on function public.create_finance_account(uuid,text,text,text,numeric,date) to authenticated;
revoke all on function public.update_finance_account(uuid,text,text,text,boolean) from public;
grant execute on function public.update_finance_account(uuid,text,text,text,boolean) to authenticated;
revoke all on function public.create_finance_obligation(uuid,text,text,uuid,uuid,uuid,uuid,text,date,date,numeric,text) from public;
grant execute on function public.create_finance_obligation(uuid,text,text,uuid,uuid,uuid,uuid,text,date,date,numeric,text) to authenticated;
revoke all on function public.settle_finance_obligation(uuid,uuid,date,numeric,text) from public;
grant execute on function public.settle_finance_obligation(uuid,uuid,date,numeric,text) to authenticated;
revoke all on function public.reverse_finance_settlement(uuid,date,text) from public;
grant execute on function public.reverse_finance_settlement(uuid,date,text) to authenticated;
revoke all on function public.cancel_finance_obligation(uuid,text) from public;
grant execute on function public.cancel_finance_obligation(uuid,text) to authenticated;
revoke all on function public.create_finance_transfer(uuid,uuid,uuid,date,numeric,text) from public;
grant execute on function public.create_finance_transfer(uuid,uuid,uuid,date,numeric,text) to authenticated;
revoke all on function public.reverse_finance_transfer(uuid,date,text) from public;
grant execute on function public.reverse_finance_transfer(uuid,date,text) to authenticated;

create or replace function public.guard_organization_settings_update()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_role text;
  v_current_month date := date_trunc('month', current_date)::date;
  v_next_month date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_initial_setup boolean := old.control_start_month is null;
begin
  if auth.uid() is null then return new; end if;

  select a.system_role into v_role
  from public.app_users a
  where a.user_id=auth.uid() and a.active=true;

  if v_role is null then raise exception 'Acesso financeiro não autorizado'; end if;
  if v_role='super_admin' then return new; end if;
  if not public.can_access_organization(old.organization_id) then raise exception 'Acesso negado à empresa'; end if;
  if new.organization_id is distinct from old.organization_id then raise exception 'A empresa da configuração é imutável'; end if;
  if new.active is distinct from old.active then raise exception 'Somente o administrador pode ativar ou desativar a empresa'; end if;
  if new.control_tier not in ('unconfigured','simple','basic','complete') then raise exception 'Nível de controle inválido'; end if;

  if old.control_start_month is not null and new.control_start_month is distinct from old.control_start_month then
    raise exception 'O mês inicial não pode ser alterado depois da configuração';
  end if;

  if new.pending_revenue_mode is not null then
    if new.pending_revenue_mode not in ('monthly','daily','individual')
       or new.pending_revenue_mode_effective is null
       or new.pending_revenue_mode_effective < v_next_month then
      raise exception 'Mudança de receitas deve ser programada para competência futura';
    end if;
  elsif new.pending_revenue_mode_effective is not null then
    raise exception 'Competência de mudança de receitas sem modo programado';
  end if;

  if new.pending_expense_mode is not null then
    if new.pending_expense_mode not in ('monthly','daily','individual')
       or new.pending_expense_mode_effective is null
       or new.pending_expense_mode_effective < v_next_month then
      raise exception 'Mudança de despesas deve ser programada para competência futura';
    end if;
  elsif new.pending_expense_mode_effective is not null then
    raise exception 'Competência de mudança de despesas sem modo programado';
  end if;

  if new.pending_control_tier is not null then
    if new.pending_control_tier not in ('simple','basic','complete')
       or new.pending_control_tier_effective is null
       or new.pending_control_tier_effective < v_next_month then
      raise exception 'Mudança de nível deve ser programada para competência futura';
    end if;
  elsif new.pending_control_tier_effective is not null then
    raise exception 'Competência de mudança de nível sem nível programado';
  end if;

  if new.revenue_mode is distinct from old.revenue_mode and not v_initial_setup then
    if old.pending_revenue_mode is null
       or old.pending_revenue_mode_effective is null
       or old.pending_revenue_mode_effective > v_current_month
       or new.revenue_mode is distinct from old.pending_revenue_mode then
      raise exception 'O modo de receitas só pode mudar quando a programação entrar em vigor';
    end if;
  end if;

  if new.expense_mode is distinct from old.expense_mode and not v_initial_setup then
    if old.pending_expense_mode is null
       or old.pending_expense_mode_effective is null
       or old.pending_expense_mode_effective > v_current_month
       or new.expense_mode is distinct from old.pending_expense_mode then
      raise exception 'O modo de despesas só pode mudar quando a programação entrar em vigor';
    end if;
  end if;

  if new.control_tier is distinct from old.control_tier and not v_initial_setup then
    if old.pending_control_tier is null
       or old.pending_control_tier_effective is null
       or old.pending_control_tier_effective > v_current_month
       or new.control_tier is distinct from old.pending_control_tier then
      raise exception 'O nível de controle só pode mudar quando a programação entrar em vigor';
    end if;
  end if;

  if new.expense_enabled is distinct from old.expense_enabled and not v_initial_setup then
    if new.control_tier is not distinct from old.control_tier
       or new.expense_enabled is distinct from (new.control_tier in ('basic','complete')) then
      raise exception 'O estado das despesas deve acompanhar a mudança válida de nível';
    end if;
  end if;

  if new.control_tier in ('basic','complete') and new.expense_enabled is not true then
    raise exception 'Controle Básico e Completo exigem despesas habilitadas';
  end if;
  if new.control_tier in ('simple','unconfigured') and new.expense_enabled is true then
    raise exception 'Controle Simples não utiliza o módulo de despesas';
  end if;

  new.updated_by:=auth.uid();
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;

create or replace function public.guard_monthly_submission_update()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_role text;
  v_control_tier text;
  v_revenue_mode text;
  v_expense_mode text;
  v_now timestamptz := clock_timestamp();
  v_completed_at text;
begin
  if auth.uid() is null then return new; end if;

  select a.system_role into v_role
  from public.app_users a
  where a.user_id=auth.uid() and a.active=true;

  if v_role is null then raise exception 'Acesso financeiro não autorizado'; end if;
  if v_role='super_admin' then return new; end if;

  if tg_op='INSERT' then
    if not public.can_access_organization(new.organization_id) then raise exception 'Acesso negado à empresa'; end if;
  else
    if not public.can_access_organization(old.organization_id) then raise exception 'Acesso negado à empresa'; end if;
    if new.organization_id is distinct from old.organization_id or new.competency is distinct from old.competency then
      raise exception 'Empresa e competência do fechamento são imutáveis';
    end if;
  end if;

  select s.control_tier,s.revenue_mode,s.expense_mode
    into v_control_tier,v_revenue_mode,v_expense_mode
  from public.organization_settings s
  where s.organization_id=new.organization_id and s.active=true;

  if not found then raise exception 'Configuração financeira ativa não encontrada para a empresa'; end if;
  if v_control_tier not in ('simple','basic','complete') then raise exception 'Nível de controle inválido para fechamento: %',v_control_tier; end if;

  v_completed_at:=to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if tg_op='INSERT' then
    if new.status is distinct from 'confirmed' then raise exception 'O primeiro fechamento deve ser criado como confirmado'; end if;
    new.confirmed_by:=auth.uid();
    new.confirmed_at:=v_now;
    new.reopened_by:=null;
    new.reopened_at:=null;
    new.reopen_reason:=null;
    new.reopen_count:=0;

    if v_control_tier='complete' then
      new.settings_snapshot:=jsonb_build_object(
        'controlTier','complete','revenueMode',v_revenue_mode,'expenseMode',v_expense_mode,
        'revenueSemantics','gross_billing','expenseSemantics','business_expense_accrual_like',
        'cashSemantics','settlement_ledger','completedAt',v_completed_at
      );
    elsif v_control_tier='basic' then
      new.settings_snapshot:=jsonb_build_object(
        'controlTier','basic','revenueMode',v_revenue_mode,'expenseMode',v_expense_mode,
        'revenueSemantics','gross_billing','expenseSemantics','business_expense_accrual_like','completedAt',v_completed_at
      );
    else
      new.settings_snapshot:=jsonb_build_object(
        'controlTier','simple','revenueMode',v_revenue_mode,'revenueSemantics','gross_billing','completedAt',v_completed_at
      );
    end if;

    new.updated_at:=v_now;
    return new;
  end if;

  if old.status='confirmed' and new.status='reopened' then
    if nullif(trim(coalesce(new.reopen_reason,'')),'') is null then raise exception 'Informe o motivo da reabertura'; end if;
    new.revenue_no_movement:=old.revenue_no_movement;
    new.expense_no_movement:=old.expense_no_movement;
    new.settings_snapshot:=old.settings_snapshot;
    new.confirmed_by:=old.confirmed_by;
    new.confirmed_at:=old.confirmed_at;
    new.reopened_by:=auth.uid();
    new.reopened_at:=v_now;
    new.reopen_count:=coalesce(old.reopen_count,0)+1;
    new.updated_at:=v_now;
    return new;
  end if;

  if old.status='reopened' and new.status='confirmed' then
    new.confirmed_by:=auth.uid();
    new.confirmed_at:=v_now;
    new.reopened_by:=old.reopened_by;
    new.reopened_at:=old.reopened_at;
    new.reopen_count:=old.reopen_count;
    new.reopen_reason:=null;

    if v_control_tier='complete' then
      new.settings_snapshot:=jsonb_build_object(
        'controlTier','complete','revenueMode',v_revenue_mode,'expenseMode',v_expense_mode,
        'revenueSemantics','gross_billing','expenseSemantics','business_expense_accrual_like',
        'cashSemantics','settlement_ledger','completedAt',v_completed_at
      );
    elsif v_control_tier='basic' then
      new.settings_snapshot:=jsonb_build_object(
        'controlTier','basic','revenueMode',v_revenue_mode,'expenseMode',v_expense_mode,
        'revenueSemantics','gross_billing','expenseSemantics','business_expense_accrual_like','completedAt',v_completed_at
      );
    else
      new.settings_snapshot:=jsonb_build_object(
        'controlTier','simple','revenueMode',v_revenue_mode,'revenueSemantics','gross_billing','completedAt',v_completed_at
      );
    end if;

    new.updated_at:=v_now;
    return new;
  end if;

  raise exception 'Transição de fechamento não permitida: % -> %',old.status,new.status;
end;
$$;
