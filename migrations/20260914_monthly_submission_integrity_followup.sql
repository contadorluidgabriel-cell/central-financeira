-- Fechamento mensal — integridade de auditoria
-- Protege o primeiro fechamento e a reconfirmação contra adulteração direta
-- pela Data API. O snapshot passa a ser reconstruído pelo banco.

create or replace function public.guard_monthly_submission_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_control_tier text;
  v_revenue_mode text;
  v_expense_mode text;
  v_now timestamptz := clock_timestamp();
  v_completed_at text;
begin
  -- Rotinas administrativas/migrations conectadas como owner não possuem JWT.
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

  if tg_op = 'INSERT' then
    if not public.can_access_organization(new.organization_id) then
      raise exception 'Acesso negado à empresa';
    end if;
  else
    if not public.can_access_organization(old.organization_id) then
      raise exception 'Acesso negado à empresa';
    end if;

    if new.organization_id is distinct from old.organization_id
       or new.competency is distinct from old.competency then
      raise exception 'Empresa e competência do fechamento são imutáveis';
    end if;
  end if;

  select s.control_tier, s.revenue_mode, s.expense_mode
    into v_control_tier, v_revenue_mode, v_expense_mode
  from public.organization_settings s
  where s.organization_id = new.organization_id
    and s.active = true;

  if not found then
    raise exception 'Configuração financeira ativa não encontrada para a empresa';
  end if;

  if v_control_tier not in ('simple', 'basic') then
    raise exception 'Nível de controle inválido para fechamento: %', v_control_tier;
  end if;

  v_completed_at := to_char(
    v_now at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  -- Primeiro fechamento: campos de auditoria e snapshot são sempre canônicos.
  if tg_op = 'INSERT' then
    if new.status is distinct from 'confirmed' then
      raise exception 'O primeiro fechamento deve ser criado como confirmado';
    end if;

    new.confirmed_by := auth.uid();
    new.confirmed_at := v_now;
    new.reopened_by := null;
    new.reopened_at := null;
    new.reopen_reason := null;
    new.reopen_count := 0;

    if v_control_tier = 'basic' then
      new.settings_snapshot := jsonb_build_object(
        'controlTier', 'basic',
        'revenueMode', v_revenue_mode,
        'expenseMode', v_expense_mode,
        'revenueSemantics', 'gross_billing',
        'expenseSemantics', 'business_expense_accrual_like',
        'completedAt', v_completed_at
      );
    else
      new.settings_snapshot := jsonb_build_object(
        'controlTier', 'simple',
        'revenueMode', v_revenue_mode,
        'revenueSemantics', 'gross_billing',
        'completedAt', v_completed_at
      );
    end if;

    new.updated_at := v_now;
    return new;
  end if;

  -- Reabertura: preserva o fechamento original e registra a nova reabertura.
  if old.status = 'confirmed' and new.status = 'reopened' then
    if nullif(trim(coalesce(new.reopen_reason, '')), '') is null then
      raise exception 'Informe o motivo da reabertura';
    end if;

    new.revenue_no_movement := old.revenue_no_movement;
    new.expense_no_movement := old.expense_no_movement;
    new.settings_snapshot := old.settings_snapshot;
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
    new.reopened_by := auth.uid();
    new.reopened_at := v_now;
    new.reopen_count := coalesce(old.reopen_count, 0) + 1;
    new.updated_at := v_now;
    return new;
  end if;

  -- Reconfirmação: preserva toda a trilha de reabertura e recalcula o snapshot
  -- a partir da configuração real da empresa, ignorando valores enviados pelo cliente.
  if old.status = 'reopened' and new.status = 'confirmed' then
    new.confirmed_by := auth.uid();
    new.confirmed_at := v_now;
    new.reopened_by := old.reopened_by;
    new.reopened_at := old.reopened_at;
    new.reopen_count := old.reopen_count;
    new.reopen_reason := null;

    if v_control_tier = 'basic' then
      new.settings_snapshot := jsonb_build_object(
        'controlTier', 'basic',
        'revenueMode', v_revenue_mode,
        'expenseMode', v_expense_mode,
        'revenueSemantics', 'gross_billing',
        'expenseSemantics', 'business_expense_accrual_like',
        'completedAt', v_completed_at
      );
    else
      new.settings_snapshot := jsonb_build_object(
        'controlTier', 'simple',
        'revenueMode', v_revenue_mode,
        'revenueSemantics', 'gross_billing',
        'completedAt', v_completed_at
      );
    end if;

    new.updated_at := v_now;
    return new;
  end if;

  raise exception 'Transição de fechamento não permitida: % -> %', old.status, new.status;
end;
$$;

revoke all on function public.guard_monthly_submission_update() from public;

drop trigger if exists trg_guard_monthly_submission_update on public.monthly_submissions;
create trigger trg_guard_monthly_submission_update
before insert or update on public.monthly_submissions
for each row
execute function public.guard_monthly_submission_update();
