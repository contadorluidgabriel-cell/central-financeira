-- Importação atômica — Central Financeira
-- A confirmação de uma planilha passa a criar cadastros e lançamentos em uma
-- única transação PostgreSQL. Qualquer erro desfaz toda a importação.

-- Índices legados ignoravam entry_status e impediam substituir um total
-- mensal/diário depois de cancelado.
drop index if exists public.financial_entries_monthly_uidx;
drop index if exists public.financial_entries_daily_uidx;

create unique index if not exists financial_entries_active_monthly_uq
  on public.financial_entries (organization_id, type, competency)
  where mode = 'monthly' and entry_status = 'active';

create unique index if not exists financial_entries_active_daily_uq
  on public.financial_entries (organization_id, type, occurred_on)
  where mode = 'daily' and entry_status = 'active';

create or replace function public.finance_normalize_key(p_value text)
returns text
language sql
immutable
as $func$
  select regexp_replace(
    translate(
      lower(trim(coalesce(p_value, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  );
$func$;

create or replace function public.import_financial_entries_atomic(
  p_organization_id uuid,
  p_competency date,
  p_type text,
  p_mode text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $func$
declare
  v_row jsonb;
  v_amount numeric;
  v_date date;
  v_category_id uuid;
  v_customer_id uuid;
  v_supplier_id uuid;
  v_payment_id uuid;
  v_entry_id uuid;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_name text;
  v_document text;
begin
  if not public.can_access_organization(p_organization_id) then
    raise exception 'Acesso negado à empresa';
  end if;

  if not public.is_financial_competency_open(p_organization_id, p_competency) then
    raise exception 'A competência está concluída. Reabra o mês antes de importar.';
  end if;

  if p_type not in ('revenue', 'expense') then
    raise exception 'Tipo de lançamento inválido';
  end if;

  if p_mode not in ('monthly', 'daily', 'individual') then
    raise exception 'Modo de importação inválido';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhuma linha válida para importar';
  end if;

  if p_mode = 'monthly' and jsonb_array_length(p_rows) <> 1 then
    raise exception 'No modo Total do mês, importe apenas uma linha por competência';
  end if;

  -- Serializa importações concorrentes da mesma empresa/tipo/período/modo.
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_organization_id::text || ':' || p_type || ':' || p_competency::text || ':' || p_mode,
      0
    )
  );

  if p_mode = 'monthly' and exists (
    select 1
    from public.financial_entries e
    where e.organization_id = p_organization_id
      and e.type = p_type
      and e.competency = p_competency
      and e.mode = 'monthly'
      and e.entry_status = 'active'
  ) then
    raise exception 'Já existe um total mensal ativo neste período';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_amount := nullif(v_row->>'amount', '')::numeric;
    exception when others then
      raise exception 'A importação contém valor inválido';
    end;

    if v_amount is null or v_amount <= 0 then
      raise exception 'A importação contém valor inválido';
    end if;

    if p_mode = 'monthly' then
      v_date := null;
    else
      begin
        v_date := nullif(v_row->>'date', '')::date;
      exception when others then
        raise exception 'A importação contém data inválida';
      end;

      if v_date is null or date_trunc('month', v_date)::date <> p_competency then
        raise exception 'A importação contém data fora do período selecionado';
      end if;
    end if;

    if p_mode = 'daily' and exists (
      select 1
      from public.financial_entries e
      where e.organization_id = p_organization_id
        and e.type = p_type
        and e.occurred_on = v_date
        and e.mode = 'daily'
        and e.entry_status = 'active'
    ) then
      raise exception 'Já existe um total diário ativo para %', v_date;
    end if;

    v_category_id := null;
    v_customer_id := null;
    v_supplier_id := null;
    v_payment_id := null;

    if p_mode = 'individual' then
      if nullif(trim(v_row->>'categoryName'), '') is not null then
        v_name := trim(v_row->>'categoryName');
        select c.id
          into v_category_id
        from public.financial_categories c
        where c.organization_id = p_organization_id
          and c.type = p_type
          and public.finance_normalize_key(c.name) = public.finance_normalize_key(v_name)
        limit 1;

        if v_category_id is null then
          insert into public.financial_categories (
            organization_id, type, name, is_default, active, created_by, updated_at
          ) values (
            p_organization_id, p_type, v_name, false, true, auth.uid(), clock_timestamp()
          )
          returning id into v_category_id;
        end if;
      end if;

      if nullif(trim(v_row->>'paymentName'), '') is not null then
        v_name := trim(v_row->>'paymentName');
        if public.finance_normalize_key(v_name) = 'a prazo' then
          raise exception '“A prazo” não pode ser usado como meio de pagamento';
        end if;

        select m.id
          into v_payment_id
        from public.finance_payment_methods m
        where m.organization_id = p_organization_id
          and public.finance_normalize_key(m.name) = public.finance_normalize_key(v_name)
        limit 1;

        if v_payment_id is null then
          insert into public.finance_payment_methods (
            organization_id, name, is_default, active, created_by, updated_at
          ) values (
            p_organization_id, v_name, false, true, auth.uid(), clock_timestamp()
          )
          returning id into v_payment_id;
        end if;
      end if;

      if p_type = 'revenue' then
        if nullif(trim(v_row->>'customerName'), '') is not null then
          v_name := trim(v_row->>'customerName');
          v_document := nullif(regexp_replace(coalesce(v_row->>'document', ''), '\D', '', 'g'), '');

          if v_document is not null then
            select c.id
              into v_customer_id
            from public.finance_customers c
            where c.organization_id = p_organization_id
              and c.merged_into is null
              and regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_document
            limit 1;
          end if;

          if v_customer_id is null then
            select c.id
              into v_customer_id
            from public.finance_customers c
            where c.organization_id = p_organization_id
              and c.merged_into is null
              and public.finance_normalize_key(c.name) = public.finance_normalize_key(v_name)
            limit 1;
          end if;

          if v_customer_id is null then
            insert into public.finance_customers (
              organization_id, name, document, active, created_by, updated_at
            ) values (
              p_organization_id,
              v_name,
              nullif(trim(v_row->>'document'), ''),
              true,
              auth.uid(),
              clock_timestamp()
            )
            returning id into v_customer_id;
          end if;
        else
          select c.id
            into v_customer_id
          from public.finance_customers c
          where c.organization_id = p_organization_id
            and c.is_consumer_final = true
            and c.merged_into is null
          limit 1;

          if v_customer_id is null then
            insert into public.finance_customers (
              organization_id, name, is_consumer_final, active, created_by, updated_at
            ) values (
              p_organization_id, 'Consumidor final', true, true, auth.uid(), clock_timestamp()
            )
            returning id into v_customer_id;
          end if;
        end if;
      else
        if nullif(trim(v_row->>'supplierName'), '') is not null then
          v_name := trim(v_row->>'supplierName');
          v_document := nullif(regexp_replace(coalesce(v_row->>'document', ''), '\D', '', 'g'), '');

          if v_document is not null then
            select s.id
              into v_supplier_id
            from public.finance_suppliers s
            where s.organization_id = p_organization_id
              and s.merged_into is null
              and regexp_replace(coalesce(s.document, ''), '\D', '', 'g') = v_document
            limit 1;
          end if;

          if v_supplier_id is null then
            select s.id
              into v_supplier_id
            from public.finance_suppliers s
            where s.organization_id = p_organization_id
              and s.merged_into is null
              and public.finance_normalize_key(s.name) = public.finance_normalize_key(v_name)
            limit 1;
          end if;

          if v_supplier_id is null then
            insert into public.finance_suppliers (
              organization_id, name, document, active, created_by, updated_at
            ) values (
              p_organization_id,
              v_name,
              nullif(trim(v_row->>'document'), ''),
              true,
              auth.uid(),
              clock_timestamp()
            )
            returning id into v_supplier_id;
          end if;
        else
          select s.id
            into v_supplier_id
          from public.finance_suppliers s
          where s.organization_id = p_organization_id
            and s.is_unspecified = true
            and s.merged_into is null
          limit 1;

          if v_supplier_id is null then
            insert into public.finance_suppliers (
              organization_id, name, is_unspecified, active, created_by, updated_at
            ) values (
              p_organization_id, 'Fornecedor não informado', true, true, auth.uid(), clock_timestamp()
            )
            returning id into v_supplier_id;
          end if;
        end if;
      end if;
    end if;

    insert into public.financial_entries (
      organization_id,
      competency,
      occurred_on,
      type,
      description,
      category_id,
      amount,
      mode,
      created_by,
      updated_at,
      customer_id,
      supplier_id,
      payment_method_id,
      entry_status,
      cancelled_at,
      cancel_reason,
      adjustment_kind,
      source_entry_id
    ) values (
      p_organization_id,
      p_competency,
      v_date,
      p_type,
      coalesce(v_row->>'description', ''),
      v_category_id,
      v_amount,
      p_mode,
      auth.uid(),
      clock_timestamp(),
      v_customer_id,
      v_supplier_id,
      v_payment_id,
      'active',
      null,
      null,
      null,
      null
    )
    returning id into v_entry_id;

    v_ids := v_ids || jsonb_build_array(v_entry_id);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('count', v_count, 'ids', v_ids);
end;
$func$;

revoke all on function public.import_financial_entries_atomic(uuid,date,text,text,jsonb) from public;
grant execute on function public.import_financial_entries_atomic(uuid,date,text,text,jsonb) to authenticated;
