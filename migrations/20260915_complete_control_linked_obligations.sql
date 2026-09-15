-- Controle Completo — vínculo entre competência e obrigação.
-- Em lançamentos agregados (mensal/diário), permite informar cliente/fornecedor
-- na obrigação quando o financial_entry não possui contraparte própria.

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

    if v_direction='receivable' then
      v_customer_id := coalesce(v_entry.customer_id,p_customer_id);
      v_supplier_id := null;
    else
      v_supplier_id := coalesce(v_entry.supplier_id,p_supplier_id);
      v_customer_id := null;
    end if;

    v_category_id := coalesce(v_entry.category_id,p_category_id);
    v_description := coalesce(
      v_description,
      nullif(btrim(v_entry.description),''),
      case when v_direction='receivable' then 'Conta a receber' else 'Conta a pagar' end
    );
    v_issue_date := coalesce(v_issue_date,v_entry.occurred_on,v_entry.competency);
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

revoke all on function public.create_finance_obligation(uuid,text,text,uuid,uuid,uuid,uuid,text,date,date,numeric,text) from public;
grant execute on function public.create_finance_obligation(uuid,text,text,uuid,uuid,uuid,uuid,text,date,date,numeric,text) to authenticated;
