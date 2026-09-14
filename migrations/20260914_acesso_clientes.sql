-- Acesso de clientes — vínculo seguro entre Neon Auth, empresa e estado de primeiro acesso.

alter table public.app_users
  add column if not exists organization_id uuid references neon_auth.organization(id) on delete set null,
  add column if not exists email text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_login_at timestamptz;

update public.app_users a
set email = u.email
from neon_auth."user" u
where u.id = a.user_id
  and (a.email is null or trim(a.email) = '');

create index if not exists app_users_organization_idx
  on public.app_users(organization_id);

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
    created_at,
    updated_at
  ) values (
    p_user_id,
    'client_user',
    true,
    p_organization_id,
    lower(trim(p_email)),
    true,
    now(),
    now()
  )
  on conflict (user_id) do update
  set system_role = 'client_user',
      active = true,
      organization_id = excluded.organization_id,
      email = excluded.email,
      must_change_password = true,
      updated_at = now();
end;
$$;

create or replace function public.list_client_access()
returns table(
  user_id uuid,
  organization_id uuid,
  email text,
  active boolean,
  must_change_password boolean,
  last_login_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    a.user_id,
    a.organization_id,
    a.email,
    a.active,
    a.must_change_password,
    a.last_login_at,
    a.created_at
  from public.app_users a
  where a.system_role = 'client_user'
    and a.organization_id is not null;
end;
$$;

create or replace function public.complete_client_password_change()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.app_users
  set must_change_password = false,
      last_login_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and system_role = 'client_user'
    and active = true;

  if not found then
    raise exception 'Acesso de cliente não encontrado ou bloqueado';
  end if;
end;
$$;

create or replace function public.touch_client_login()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.app_users
  set last_login_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and system_role = 'client_user'
    and active = true
    and must_change_password = false;
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
      active = true,
      updated_at = now()
  where user_id = p_user_id
    and system_role = 'client_user';

  if not found then
    raise exception 'Acesso de cliente não encontrado';
  end if;
end;
$$;

create or replace function public.set_client_access_active(
  p_user_id uuid,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado';
  end if;

  update public.app_users
  set active = p_active,
      updated_at = now()
  where user_id = p_user_id
    and system_role = 'client_user';

  if not found then
    raise exception 'Acesso de cliente não encontrado';
  end if;
end;
$$;

grant execute on function public.register_client_access(uuid, uuid, text) to authenticated;
grant execute on function public.list_client_access() to authenticated;
grant execute on function public.complete_client_password_change() to authenticated;
grant execute on function public.touch_client_login() to authenticated;
grant execute on function public.mark_client_password_temporary(uuid) to authenticated;
grant execute on function public.set_client_access_active(uuid, boolean) to authenticated;
