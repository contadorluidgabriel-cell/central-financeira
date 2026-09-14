-- Correções críticas de segurança — Central Financeira
-- 1) Primeiro acesso só conclui depois de uma troca real da senha.
-- 2) Cliente possui uma única organização autorizada.
-- 3) RLS usa o vínculo app_users como fonte de verdade do tenant.
-- 4) Lançamentos não podem ser movidos/inseridos/editados/excluídos em competência fechada.
--
-- IMPORTANTE: revisar/testar em branch temporária antes de aplicar em production.

alter table public.app_users
  add column if not exists temporary_password_set_at timestamptz;

update public.app_users
set temporary_password_set_at = coalesce(temporary_password_set_at, now())
where system_role = 'client_user'
  and must_change_password = true;

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

grant execute on function public.can_access_organization(uuid) to authenticated;

create or replace function public.is_financial_competency_open(
  p_organization_id uuid,
  p_competency date
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    not exists (
      select 1
      from public.monthly_submissions s
      where s.organization_id = p_organization_id
        and s.competency = p_competency
        and s.status = 'confirmed'
    )
    and not exists (
      select 1
      from public.monthly_closings c
      where c.organization_id = p_organization_id
        and c.competency = p_competency
        and c.status = 'closed'
    );
$$;

grant execute on function public.is_financial_competency_open(uuid, date) to authenticated;

-- Corrige memberships antigas de client_user: uma única empresa por acesso.
delete from neon_auth.member m
using public.app_users a
where a.user_id = m."userId"
  and a.system_role = 'client_user'
  and a.organization_id is not null
  and m."organizationId" <> a.organization_id;

insert into neon_auth.member ("organizationId", "userId", role, "createdAt")
select a.organization_id, a.user_id, 'member', now()
from public.app_users a
where a.system_role = 'client_user'
  and a.active = true
  and a.organization_id is not null
on conflict do nothing;

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

  -- Client_user é single-tenant: remove qualquer membership anterior.
  delete from neon_auth.member
  where "userId" = p_user_id
    and "organizationId" <> p_organization_id;

  insert into neon_auth.member ("organizationId", "userId", role, "createdAt")
  select p_organization_id, p_user_id, 'member', now()
  where not exists (
    select 1 from neon_auth.member
    where "organizationId" = p_organization_id
      and "userId" = p_user_id
  );

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

create or replace function public.mark_client_password_temporary(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
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
end;
$$;

create or replace function public.complete_client_password_change()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, neon_auth
as $$
declare
  v_temp_set_at timestamptz;
  v_credential_updated_at timestamptz;
begin
  select a.temporary_password_set_at
    into v_temp_set_at
  from public.app_users a
  where a.user_id = auth.uid()
    and a.system_role = 'client_user'
    and a.active = true
    and a.must_change_password = true;

  if not found then
    raise exception 'Acesso de cliente não encontrado, bloqueado ou já ativado';
  end if;

  select acc."updatedAt"
    into v_credential_updated_at
  from neon_auth.account acc
  where acc."userId" = auth.uid()
    and acc."providerId" = 'credential'
  order by acc."updatedAt" desc
  limit 1;

  if v_credential_updated_at is null
     or v_temp_set_at is null
     or v_credential_updated_at <= v_temp_set_at then
    raise exception 'Troque a senha provisória antes de concluir o primeiro acesso';
  end if;

  update public.app_users
  set must_change_password = false,
      temporary_password_set_at = null,
      last_login_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and system_role = 'client_user'
    and active = true;
end;
$$;

-- Tenant: substitui auth.organization_id() pelo vínculo autorizado no app_users.
alter policy account_movements_tenant_all_v2 on public.account_movements
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy finance_profiles_tenant_select_v2 on public.finance_profiles
  using (public.can_access_organization(organization_id));
alter policy finance_profiles_tenant_insert_v2 on public.finance_profiles
  with check (public.can_access_organization(organization_id));
alter policy finance_profiles_tenant_update_v2 on public.finance_profiles
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy finance_customers_select_v3 on public.finance_customers
  using (public.can_access_organization(organization_id));
alter policy finance_customers_insert_v3 on public.finance_customers
  with check (public.can_access_organization(organization_id));
alter policy finance_customers_update_v3 on public.finance_customers
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy finance_customers_delete_v3 on public.finance_customers
  using (public.can_access_organization(organization_id));

alter policy finance_payment_methods_select_v3 on public.finance_payment_methods
  using (public.can_access_organization(organization_id));
alter policy finance_payment_methods_insert_v3 on public.finance_payment_methods
  with check (public.can_access_organization(organization_id));
alter policy finance_payment_methods_update_v3 on public.finance_payment_methods
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy finance_suppliers_select_v1 on public.finance_suppliers
  using (public.can_access_organization(organization_id));
alter policy finance_suppliers_insert_v1 on public.finance_suppliers
  with check (public.can_access_organization(organization_id));
alter policy finance_suppliers_update_v1 on public.finance_suppliers
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy finance_suppliers_delete_v1 on public.finance_suppliers
  using (public.can_access_organization(organization_id));

alter policy financial_accounts_tenant_all_v2 on public.financial_accounts
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy financial_categories_select on public.financial_categories
  using (public.can_access_organization(organization_id));
alter policy financial_categories_client_insert_v3 on public.financial_categories
  with check (public.can_access_organization(organization_id));
alter policy financial_categories_client_update_v3 on public.financial_categories
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

-- Fechamento: a regra é validada tanto na linha antiga (USING) quanto na nova (WITH CHECK).
alter policy financial_entries_select on public.financial_entries
  using (public.can_access_organization(organization_id));

alter policy financial_entries_insert on public.financial_entries
  with check (
    public.can_access_organization(organization_id)
    and (public.is_super_admin() or created_by = auth.uid())
    and public.is_financial_competency_open(organization_id, competency)
  );

alter policy financial_entries_update on public.financial_entries
  using (
    public.can_access_organization(organization_id)
    and public.is_financial_competency_open(organization_id, competency)
  )
  with check (
    public.can_access_organization(organization_id)
    and public.is_financial_competency_open(organization_id, competency)
  );

alter policy financial_entries_delete on public.financial_entries
  using (
    public.can_access_organization(organization_id)
    and public.is_financial_competency_open(organization_id, competency)
  );

-- A policy ALL de super_admin não pode virar um bypass para competência fechada.
alter policy financial_entries_super_admin_v2 on public.financial_entries
  using (
    public.is_super_admin()
    and public.is_financial_competency_open(organization_id, competency)
  )
  with check (
    public.is_super_admin()
    and public.is_financial_competency_open(organization_id, competency)
  );

alter policy installment_plans_tenant_all_v2 on public.installment_plans
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy installments_tenant_all_v2 on public.installments
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy monthly_budgets_tenant_all_v2 on public.monthly_budgets
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy monthly_closings_select on public.monthly_closings
  using (public.can_access_organization(organization_id));

alter policy monthly_submissions_select on public.monthly_submissions
  using (public.can_access_organization(organization_id));
alter policy monthly_submissions_insert on public.monthly_submissions
  with check (
    public.can_access_organization(organization_id)
    and status = 'confirmed'
    and confirmed_by = auth.uid()
  );
alter policy monthly_submissions_client_update_v3 on public.monthly_submissions
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy monthly_submissions_update on public.monthly_submissions
  using (
    public.can_access_organization(organization_id)
    and status = 'reopened'
  )
  with check (
    public.can_access_organization(organization_id)
    and status = 'confirmed'
    and confirmed_by = auth.uid()
  );

alter policy organization_settings_select on public.organization_settings
  using (public.can_access_organization(organization_id));
alter policy organization_settings_client_update_v3 on public.organization_settings
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy payables_tenant_all_v2 on public.payables
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy receivables_tenant_all_v2 on public.receivables
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));
alter policy recurring_items_tenant_all_v2 on public.recurring_items
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

alter policy simple_control_notifications_select_v3 on public.simple_control_notifications
  using (public.can_access_organization(organization_id));
alter policy simple_control_notifications_insert_v3 on public.simple_control_notifications
  with check (public.can_access_organization(organization_id));

alter policy audit_events_client_insert_v3 on public.audit_events
  with check (
    public.can_access_organization(organization_id)
    and actor_user_id = auth.uid()
  );
