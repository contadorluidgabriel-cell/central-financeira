-- Central Financeira — correções dos bloqueadores encontrados na bateria V36.
--
-- Regras:
-- 1) caixa realizado não aceita datas futuras;
-- 2) conta financeira não nasce no futuro;
-- 3) recorrência respeita a data-limite exata e avança pelo último vencimento efetivamente gerado.

create or replace function public.finance_business_today()
returns date
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;
revoke all on function public.finance_business_today() from public, authenticated;

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
  if p_opening_date > public.finance_business_today() then raise exception 'A data inicial da conta não pode estar no futuro'; end if;

  insert into public.finance_accounts(
    organization_id,name,kind,institution,opening_balance,opening_date,active,created_by,updated_at
  ) values (
    p_organization_id,btrim(p_name),p_kind,nullif(btrim(coalesce(p_institution,'')),''),
    coalesce(p_opening_balance,0),p_opening_date,true,auth.uid(),now()
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
  if p_settled_on > public.finance_business_today() then raise exception 'A baixa não pode ser lançada com data futura'; end if;
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
  if p_reversed_on > public.finance_business_today() then raise exception 'O estorno não pode ser lançado com data futura'; end if;
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
  if p_transferred_on > public.finance_business_today() then raise exception 'A transferência não pode ser lançada com data futura'; end if;
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
  if p_reversed_on > public.finance_business_today() then raise exception 'O estorno não pode ser lançado com data futura'; end if;
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
  v_last_occurrence date;
  v_count integer:=0;
begin
  if p_through is null then raise exception 'Informe até quando gerar'; end if;

  select * into v_rule from public.finance_recurring_rules_v2 where id=p_rule_id for update;
  if not found then raise exception 'Recorrência não encontrada'; end if;
  perform public.finance_assert_org_access(v_rule.organization_id);
  if not v_rule.active then raise exception 'A recorrência está encerrada'; end if;
  if p_through < v_rule.starts_on then raise exception 'A data final de geração não pode ser anterior ao início da recorrência'; end if;

  perform pg_advisory_xact_lock(hashtext(v_rule.id::text));

  select max(occurrence_date)
    into v_last_occurrence
  from public.finance_recurring_members_v2
  where recurring_id=v_rule.id;

  if v_last_occurrence is null then
    v_month:=date_trunc('month',v_rule.starts_on)::date;
  else
    v_month:=(date_trunc('month',v_last_occurrence)+interval '1 month')::date;
  end if;

  v_last_month:=date_trunc('month',least(p_through,coalesce(v_rule.ends_on,p_through)))::date;

  while v_month<=v_last_month loop
    v_due:=public.finance_v34_due_date(v_month,v_rule.due_day);

    if v_due>=v_rule.starts_on
       and v_due<=p_through
       and (v_rule.ends_on is null or v_due<=v_rule.ends_on)
       and not exists(
         select 1 from public.finance_recurring_members_v2
         where recurring_id=v_rule.id and occurrence_date=v_due
       ) then
      insert into public.finance_obligations(
        organization_id,direction,origin,customer_id,supplier_id,category_id,
        description,issue_date,due_date,original_amount,settled_amount,status,notes,created_by,updated_at
      ) values (
        v_rule.organization_id,v_rule.direction,'manual',v_rule.customer_id,v_rule.supplier_id,v_rule.category_id,
        v_rule.description,v_due,v_due,v_rule.amount,0,'open',v_rule.notes,auth.uid(),now()
      ) returning id into v_obligation_id;

      insert into public.finance_recurring_members_v2(
        recurring_id,organization_id,obligation_id,occurrence_date
      ) values (
        v_rule.id,v_rule.organization_id,v_obligation_id,v_due
      );

      v_count:=v_count+1;
    end if;

    v_month:=(v_month+interval '1 month')::date;
  end loop;

  select max(occurrence_date)
    into v_last_occurrence
  from public.finance_recurring_members_v2
  where recurring_id=v_rule.id;

  update public.finance_recurring_rules_v2
  set generated_through=v_last_occurrence,
      updated_at=now()
  where id=v_rule.id;

  return v_count;
end;
$$;
