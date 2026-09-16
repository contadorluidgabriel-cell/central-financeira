-- OFX -> financial entries. Additive: imported statements and existing ledger records remain untouched.
-- Apply to Neon QA first, then production before deploying the UI.
alter table public.ofx_bank_transactions
  add column if not exists posting_type text,
  add column if not exists posting_entry_id uuid references public.financial_entries(id) on delete set null,
  add column if not exists posting_obligation_id uuid references public.finance_obligations(id) on delete set null,
  add column if not exists posting_settlement_id uuid references public.finance_settlements(id) on delete set null,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.ofx_bank_transactions'::regclass and conname='ofx_posting_type_check') then
    alter table public.ofx_bank_transactions add constraint ofx_posting_type_check check (posting_type is null or posting_type in ('revenue','expense'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.ofx_bank_transactions'::regclass and conname='ofx_posting_state_check') then
    alter table public.ofx_bank_transactions add constraint ofx_posting_state_check check (
      (posted_at is null and posting_type is null and posting_entry_id is null and posting_obligation_id is null and posting_settlement_id is null)
      or (posted_at is not null and posting_type is not null)
    );
  end if;
end $$;
create index if not exists ofx_bank_transactions_pending_idx
  on public.ofx_bank_transactions(organization_id, posted_on desc) where posted_at is null;

create or replace function public.post_ofx_financial_entries(p_organization_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, neon_auth
as $$
declare
  v_settings public.organization_settings%rowtype;
  v_item jsonb;
  v_tx public.ofx_bank_transactions%rowtype;
  v_action text;
  v_description text;
  v_category uuid;
  v_month date;
  v_entry uuid;
  v_obligation uuid;
  v_settlement uuid;
  v_account uuid;
  v_id uuid;
  v_done integer := 0;
  v_skipped integer := 0;
  v_count integer;
begin
  if auth.uid() is null or not public.can_access_organization(p_organization_id) then
    raise exception 'Acesso negado à empresa';
  end if;
  select * into v_settings from public.organization_settings
    where organization_id=p_organization_id and active=true;
  if not found or v_settings.control_tier not in ('simple','basic','complete') then
    raise exception 'Configure o controle financeiro antes de lançar o OFX';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Seleção de lançamentos inválida';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 100 then
    raise exception 'Selecione entre 1 e 100 movimentações por confirmação';
  end if;
  -- Lock in canonical order so concurrent conversions cannot double-post or deadlock.
  for v_item in select value from jsonb_array_elements(p_items)
    order by value->>'transactionId' loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'transactionId','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'Identificador de movimentação inválido';
    end if;
    v_id := (v_item->>'transactionId')::uuid;
    select * into v_tx from public.ofx_bank_transactions
      where id=v_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Movimentação não encontrada nesta empresa'; end if;
    if v_tx.posted_at is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_action := coalesce(v_item->>'entryType','');
    if v_action not in ('revenue','expense') then raise exception 'Escolha receita ou despesa'; end if;
    if (v_action='revenue' and v_tx.amount <= 0) or
       (v_action='expense' and v_tx.amount >= 0) then
      raise exception 'Tipo de lançamento incompatível com o sinal da movimentação';
    end if;
    if v_settings.control_tier='simple' and v_action <> 'revenue' then
      raise exception 'O Controle Simples permite apenas receitas';
    end if;
    if v_tx.posted_on > public.finance_business_today() then
      raise exception 'Não é permitido registrar lançamento bancário com data futura';
    end if;
    v_month := date_trunc('month',v_tx.posted_on)::date;
    if v_settings.control_start_month is not null and v_month < v_settings.control_start_month then
      raise exception 'O extrato é anterior ao início deste controle financeiro';
    end if;
    if not public.is_financial_competency_open(p_organization_id,v_month) then
      raise exception 'A competência % está fechada',to_char(v_month,'MM/YYYY');
    end if;
    -- Never add individual bank entries on top of a monthly/daily aggregate.
    if exists (select 1 from public.financial_entries e
      where e.organization_id=p_organization_id and e.competency=v_month
        and e.type=v_action and e.entry_status='active' and e.mode <> 'individual') then
      raise exception 'Já existe total mensal/diário nesta competência. Revise os lançamentos antes de converter o OFX';
    end if;
    v_category := null;
    if nullif(v_item->>'categoryId','') is not null then
      if (v_item->>'categoryId') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'Categoria inválida';
      end if;
      v_category := (v_item->>'categoryId')::uuid;
      if not exists (select 1 from public.financial_categories c
        where c.id=v_category and c.organization_id=p_organization_id
          and c.type=v_action and c.active=true) then
        raise exception 'Categoria inativa ou de outra empresa';
      end if;
    end if;
    v_description := btrim(coalesce(v_item->>'description',v_tx.description));
    if length(v_description) not between 1 and 300 then raise exception 'Descrição inválida'; end if;
    v_obligation := null;
    v_settlement := null;
    insert into public.financial_entries (
      organization_id,competency,occurred_on,type,description,category_id,amount,
      mode,entry_status,created_by,updated_at
    ) values (
      p_organization_id,v_month,v_tx.posted_on,v_action,v_description,v_category,
      abs(v_tx.amount),'individual','active',auth.uid(),now()
    ) returning id into v_entry;
    if v_settings.control_tier='complete' then
      select b.account_id into v_account from public.ofx_bank_imports b
        where b.id=v_tx.import_id and b.organization_id=p_organization_id;
      if v_account is null then raise exception 'O extrato não possui conta financeira vinculada'; end if;
      v_obligation := public.create_finance_obligation(
        p_organization_id,case when v_action='revenue' then 'receivable' else 'payable' end,
        'financial_entry',v_entry,null,null,v_category,v_description,
        v_tx.posted_on,v_tx.posted_on,abs(v_tx.amount),'Origem: extrato OFX'
      );
      v_settlement := public.settle_finance_obligation(
        v_obligation,v_account,v_tx.posted_on,abs(v_tx.amount),'Baixa vinculada ao extrato OFX'
      );
    end if;
    update public.ofx_bank_transactions
      set posting_type=v_action,posting_entry_id=v_entry,
          posting_obligation_id=v_obligation,posting_settlement_id=v_settlement,
          posted_at=now(),posted_by=auth.uid()
      where id=v_tx.id and organization_id=p_organization_id and posted_at is null;
    if not found then raise exception 'Movimentação alterada por outra operação'; end if;
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('posted',v_done,'alreadyPosted',v_skipped);
end;
$$;
revoke all on function public.post_ofx_financial_entries(uuid,jsonb) from public,anonymous;
grant execute on function public.post_ofx_financial_entries(uuid,jsonb) to authenticated;
