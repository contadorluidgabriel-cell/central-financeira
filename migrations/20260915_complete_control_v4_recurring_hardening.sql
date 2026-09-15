-- Evita geração duplicada/orphan em chamadas concorrentes de recorrência.
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
  perform pg_advisory_xact_lock(hashtext(v_rule.id::text));

  v_month:=date_trunc('month',coalesce(v_rule.generated_through,v_rule.starts_on))::date;
  if v_rule.generated_through is not null then v_month:=(v_month+interval '1 month')::date; end if;
  v_last_month:=date_trunc('month',least(p_through,coalesce(v_rule.ends_on,p_through)))::date;

  while v_month<=v_last_month loop
    v_due:=public.finance_v34_due_date(v_month,v_rule.due_day);
    if v_due>=v_rule.starts_on
       and (v_rule.ends_on is null or v_due<=v_rule.ends_on)
       and not exists(select 1 from public.finance_recurring_members_v2 where recurring_id=v_rule.id and occurrence_date=v_due) then
      insert into public.finance_obligations(
        organization_id,direction,origin,customer_id,supplier_id,category_id,description,issue_date,due_date,
        original_amount,settled_amount,status,notes,created_by,updated_at
      ) values(
        v_rule.organization_id,v_rule.direction,'manual',v_rule.customer_id,v_rule.supplier_id,v_rule.category_id,
        v_rule.description,v_due,v_due,v_rule.amount,0,'open',v_rule.notes,auth.uid(),now()
      ) returning id into v_obligation_id;
      insert into public.finance_recurring_members_v2(recurring_id,organization_id,obligation_id,occurrence_date)
      values(v_rule.id,v_rule.organization_id,v_obligation_id,v_due);
      v_count:=v_count+1;
    end if;
    v_month:=(v_month+interval '1 month')::date;
  end loop;

  update public.finance_recurring_rules_v2
  set generated_through=greatest(coalesce(generated_through,starts_on),least(p_through,coalesce(ends_on,p_through))),updated_at=now()
  where id=v_rule.id;
  return v_count;
end;
$$;
revoke all on function public.generate_finance_recurring_v2(uuid,date) from public;
grant execute on function public.generate_finance_recurring_v2(uuid,date) to authenticated;
