-- Pilot readiness hardening
-- Security: temporary-password access barrier + session revocation on reset/relink.
-- Operations: atomic month reopen + explicit recurring stop scope.

create or replace function public.can_access_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, neon_auth
as $$
  select exists (
    select 1
    from public.app_users a
    where a.user_id = auth.uid()
      and a.active = true
      and (
        a.system_role = 'super_admin'
        or (
          a.system_role = 'client_user'
          and a.organization_id = p_organization_id
          and a.must_change_password = false
        )
        or (
          a.system_role = 'office_user'
          and exists (
            select 1
            from neon_auth.member m
            where m."userId" = a.user_id
              and m."organizationId" = p_organization_id
          )
        )
      )
  );
$$;

create or replace function public.register_client_access(
  p_user_id uuid,
  p_organization_id uuid,
  p_email text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, neon_auth
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  if exists (
    select 1 from public.app_users
    where user_id = p_user_id and system_role = 'super_admin'
  ) then
    raise exception 'Este usuário é administrador e não pode ser vinculado como cliente';
  end if;

  if not exists (select 1 from neon_auth."user" where id = p_user_id) then
    raise exception 'Usuário de autenticação não encontrado';
  end if;

  if not exists (select 1 from neon_auth.organization where id = p_organization_id) then
    raise exception 'Empresa não encontrada';
  end if;

  -- Um relink deve invalidar sessões anteriores antes de conceder o novo vínculo.
  delete from neon_auth.session where "userId" = p_user_id;
  delete from neon_auth.member where "userId" = p_user_id;

  insert into neon_auth.member ("organizationId", "userId", role, "createdAt")
  values (p_organization_id, p_user_id, 'member', now());

  insert into public.app_users (
    user_id,
    system_role,
    active,
    organization_id,
    email,
    must_change_password,
    temporary_password_set_at,
    created_at,
    updated_at
  ) values (
    p_user_id,
    'client_user',
    true,
    p_organization_id,
    lower(trim(p_email)),
    true,
    clock_timestamp(),
    now(),
    now()
  )
  on conflict (user_id) do update
  set system_role = 'client_user',
      active = true,
      organization_id = excluded.organization_id,
      email = excluded.email,
      must_change_password = true,
      temporary_password_set_at = clock_timestamp(),
      updated_at = now();
end;
$$;

create or replace function public.prepare_client_password_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, neon_auth
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  update public.app_users
  set must_change_password = true,
      temporary_password_set_at = clock_timestamp(),
      active = true,
      updated_at = now()
  where user_id = p_user_id
    and system_role = 'client_user';

  if not found then
    raise exception 'Acesso de cliente não encontrado';
  end if;

  -- Derruba sessões antigas antes da nova senha ser emitida.
  delete from neon_auth.session where "userId" = p_user_id;
end;
$$;

create or replace function public.mark_client_password_temporary(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, neon_auth
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  update public.app_users
  set must_change_password = true,
      temporary_password_set_at = clock_timestamp(),
      active = true,
      updated_at = now()
  where user_id = p_user_id
    and system_role = 'client_user';

  if not found then
    raise exception 'Acesso de cliente não encontrado';
  end if;

  delete from neon_auth.session where "userId" = p_user_id;
end;
$$;

revoke all on function public.prepare_client_password_reset(uuid) from public;
grant execute on function public.prepare_client_password_reset(uuid) to authenticated;

create or replace function public.reopen_financial_month_atomic(
  p_organization_id uuid,
  p_competency date,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, neon_auth
as $$
declare
  v_submission public.monthly_submissions%rowtype;
  v_reopen_count integer;
  v_tier text;
  v_org_name text;
  v_notification_type text;
  v_event_type text;
  v_title text;
begin
  if p_competency is null or extract(day from p_competency) <> 1 then
    raise exception 'Competência inválida';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo da reabertura';
  end if;

  if not public.can_access_organization(p_organization_id) then
    raise exception 'Acesso negado à empresa';
  end if;

  select *
    into v_submission
  from public.monthly_submissions
  where organization_id = p_organization_id
    and competency = p_competency
  for update;

  if not found then
    raise exception 'Fechamento não encontrado';
  end if;

  if v_submission.status <> 'confirmed' then
    raise exception 'A competência já está reaberta';
  end if;

  update public.monthly_submissions
  set status = 'reopened',
      reopen_reason = btrim(p_reason),
      updated_at = clock_timestamp()
  where organization_id = p_organization_id
    and competency = p_competency
  returning reopen_count into v_reopen_count;

  select o.name into v_org_name
  from neon_auth.organization o
  where o.id = p_organization_id;

  v_tier := coalesce(
    nullif(v_submission.settings_snapshot ->> 'controlTier', ''),
    (select s.control_tier from public.organization_settings s where s.organization_id = p_organization_id),
    'simple'
  );

  if v_tier = 'basic' then
    v_notification_type := 'basic_month_reopened';
    v_event_type := 'basic_month_reopened';
    v_title := 'Mês reaberto no Controle Básico';
  elsif v_tier = 'complete' then
    v_notification_type := 'complete_month_reopened';
    v_event_type := 'complete_month_reopened';
    v_title := 'Mês reaberto no Controle Completo';
  else
    v_notification_type := 'month_reopened';
    v_event_type := 'simple_month_reopened';
    v_title := 'Mês reaberto';
  end if;

  insert into public.simple_control_notifications (
    organization_id,
    actor_user_id,
    notification_type,
    competency,
    title,
    message,
    metadata
  ) values (
    p_organization_id,
    auth.uid(),
    v_notification_type,
    p_competency,
    v_title,
    coalesce(v_org_name, 'Cliente') || ' reabriu ' || to_char(p_competency, 'MM/YYYY') || '. Motivo: ' || btrim(p_reason),
    jsonb_build_object(
      'reason', btrim(p_reason),
      'month', to_char(p_competency, 'YYYY-MM'),
      'reopenCount', v_reopen_count,
      'controlTier', v_tier
    )
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_organization_id,
    auth.uid(),
    v_event_type,
    'monthly_submission',
    p_organization_id::text || ':' || to_char(p_competency, 'YYYY-MM'),
    jsonb_build_object(
      'reason', btrim(p_reason),
      'month', to_char(p_competency, 'YYYY-MM'),
      'reopenCount', v_reopen_count,
      'controlTier', v_tier
    )
  );

  return v_reopen_count;
end;
$$;

revoke all on function public.reopen_financial_month_atomic(uuid,date,text) from public;
grant execute on function public.reopen_financial_month_atomic(uuid,date,text) to authenticated;

create or replace function public.stop_finance_recurring_rule_v3(
  p_rule_id uuid,
  p_cancel_scope text,
  p_reference_date date,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule public.finance_recurring_rules_v2%rowtype;
  v_count integer := 0;
  v_cutoff date;
  v_reference date := coalesce(p_reference_date, current_date);
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo';
  end if;

  if p_cancel_scope not in ('keep', 'next_month', 'all_open') then
    raise exception 'Escopo de cancelamento inválido';
  end if;

  select * into v_rule
  from public.finance_recurring_rules_v2
  where id = p_rule_id
  for update;

  if not found then
    raise exception 'Recorrência não encontrada';
  end if;

  perform public.finance_assert_org_access(v_rule.organization_id);

  if not v_rule.active then
    raise exception 'A recorrência já está encerrada';
  end if;

  update public.finance_recurring_rules_v2
  set active = false,
      stopped_at = now(),
      stopped_by = auth.uid(),
      stop_reason = btrim(p_reason),
      updated_at = now()
  where id = v_rule.id;

  if p_cancel_scope = 'keep' then
    return 0;
  end if;

  if p_cancel_scope = 'next_month' then
    v_cutoff := (date_trunc('month', v_reference) + interval '1 month')::date;
  else
    v_cutoff := v_reference;
  end if;

  update public.finance_obligations o
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = 'Recorrência encerrada: ' || btrim(p_reason),
      updated_at = now()
  from public.finance_recurring_members_v2 m
  where m.recurring_id = v_rule.id
    and m.obligation_id = o.id
    and o.status = 'open'
    and o.due_date >= v_cutoff;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.stop_finance_recurring_rule_v3(uuid,text,date,text) from public;
grant execute on function public.stop_finance_recurring_rule_v3(uuid,text,date,text) to authenticated;
