-- Follow-up de segurança e integridade — Central Financeira
-- Corrige bypass de fechamento/configuração por UPDATE direto na Data API.
-- Também alinha expense_mode com o modo daily já suportado pelo frontend.
--
-- Aplicar primeiro em branch temporária do Neon.

-- O frontend já suporta despesas em Total por dia. Mantemos 'category' por
-- compatibilidade com eventuais dados legados, mas novos fluxos usam daily.
alter table public.organization_settings
  drop constraint if exists organization_settings_expense_mode_check;

alter table public.organization_settings
  add constraint organization_settings_expense_mode_check
  check (expense_mode in ('monthly', 'daily', 'category', 'individual'));

create or replace function public.guard_monthly_submission_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  -- Migrations/rotinas administrativas conectadas como owner não possuem JWT.
  if auth.uid() is null then
    return new;
  end if;

  select a.system_role
    into v_role
  from public.app_users a
  where a.user_id = auth.uid()
    and a.active = true;

  if v_role is null then
    raise exception 'Acesso financeiro não autorizado';
  end if;

  if v_role = 'super_admin' then
    return new;
  end if;

  if not public.can_access_organization(old.organization_id) then
    raise exception 'Acesso negado à empresa';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.competency is distinct from old.competency then
    raise exception 'Empresa e competência do fechamento são imutáveis';
  end if;

  -- Fluxo permitido: confirmado -> reaberto.
  if old.status = 'confirmed' and new.status = 'reopened' then
    if nullif(trim(coalesce(new.reopen_reason, '')), '') is null then
      raise exception 'Informe o motivo da reabertura';
    end if;

    -- Reabrir não pode reescrever o snapshot nem a confirmação anterior.
    if new.revenue_no_movement is distinct from old.revenue_no_movement
       or new.expense_no_movement is distinct from old.expense_no_movement
       or new.settings_snapshot is distinct from old.settings_snapshot
       or new.confirmed_by is distinct from old.confirmed_by
       or new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'A reabertura não pode alterar os dados do fechamento confirmado';
    end if;

    new.reopened_by := auth.uid();
    new.reopened_at := clock_timestamp();
    new.reopen_count := coalesce(old.reopen_count, 0) + 1;
    new.updated_at := clock_timestamp();
    return new;
  end if;

  -- Fluxo permitido: reaberto -> confirmado novamente.
  if old.status = 'reopened' and new.status = 'confirmed' then
    new.confirmed_by := auth.uid();
    new.confirmed_at := clock_timestamp();
    new.reopen_reason := null;
    new.updated_at := clock_timestamp();
    return new;
  end if;

  raise exception 'Transição de fechamento não permitida: % -> %', old.status, new.status;
end;
$$;

revoke all on function public.guard_monthly_submission_update() from public;

-- Trigger é a barreira de integridade de linha. Mesmo que uma policy permissiva
-- autorize UPDATE, a transição/colunas continuam validadas no banco.
drop trigger if exists trg_guard_monthly_submission_update on public.monthly_submissions;
create trigger trg_guard_monthly_submission_update
before update on public.monthly_submissions
for each row
execute function public.guard_monthly_submission_update();

-- Reduz o alcance da policy ampla. A validação de transição permanece no trigger.
alter policy monthly_submissions_client_update_v3 on public.monthly_submissions
  using (
    public.can_access_organization(organization_id)
    and status in ('confirmed', 'reopened')
  )
  with check (
    public.can_access_organization(organization_id)
    and status in ('confirmed', 'reopened')
  );

create or replace function public.guard_organization_settings_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_current_month date := date_trunc('month', current_date)::date;
  v_next_month date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_initial_setup boolean := old.control_start_month is null;
begin
  if auth.uid() is null then
    return new;
  end if;

  select a.system_role
    into v_role
  from public.app_users a
  where a.user_id = auth.uid()
    and a.active = true;

  if v_role is null then
    raise exception 'Acesso financeiro não autorizado';
  end if;

  if v_role = 'super_admin' then
    return new;
  end if;

  if not public.can_access_organization(old.organization_id) then
    raise exception 'Acesso negado à empresa';
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'A empresa da configuração é imutável';
  end if;

  if new.active is distinct from old.active then
    raise exception 'Somente o administrador pode ativar ou desativar a empresa';
  end if;

  if old.control_start_month is not null
     and new.control_start_month is distinct from old.control_start_month then
    raise exception 'O mês inicial não pode ser alterado depois da configuração';
  end if;

  if new.pending_revenue_mode is not null then
    if new.pending_revenue_mode not in ('monthly', 'daily', 'individual')
       or new.pending_revenue_mode_effective is null
       or new.pending_revenue_mode_effective < v_next_month then
      raise exception 'Mudança de receitas deve ser programada para competência futura';
    end if;
  elsif new.pending_revenue_mode_effective is not null then
    raise exception 'Competência de mudança de receitas sem modo programado';
  end if;

  if new.pending_expense_mode is not null then
    if new.pending_expense_mode not in ('monthly', 'daily', 'individual')
       or new.pending_expense_mode_effective is null
       or new.pending_expense_mode_effective < v_next_month then
      raise exception 'Mudança de despesas deve ser programada para competência futura';
    end if;
  elsif new.pending_expense_mode_effective is not null then
    raise exception 'Competência de mudança de despesas sem modo programado';
  end if;

  if new.pending_control_tier is not null then
    if new.pending_control_tier not in ('simple', 'basic')
       or new.pending_control_tier_effective is null
       or new.pending_control_tier_effective < v_next_month then
      raise exception 'Mudança de nível deve ser programada para competência futura';
    end if;
  elsif new.pending_control_tier_effective is not null then
    raise exception 'Competência de mudança de nível sem nível programado';
  end if;

  -- Modos atuais só podem mudar no onboarding ou quando chega a competência
  -- de uma alteração previamente programada.
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
       or new.expense_enabled is distinct from (new.control_tier = 'basic') then
      raise exception 'O estado das despesas deve acompanhar a mudança válida de nível';
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.guard_organization_settings_update() from public;

drop trigger if exists trg_guard_organization_settings_update on public.organization_settings;
create trigger trg_guard_organization_settings_update
before update on public.organization_settings
for each row
execute function public.guard_organization_settings_update();

-- A policy continua permitindo que o cliente use o fluxo legítimo do frontend,
-- mas o trigger passa a impedir mutações administrativas ou mudanças imediatas.
alter policy organization_settings_client_update_v3 on public.organization_settings
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
