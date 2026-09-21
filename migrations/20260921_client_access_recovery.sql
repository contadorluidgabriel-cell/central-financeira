-- Corrige o vínculo de acesso sem remover vínculos de outras empresas.
-- Executar antes de publicar o frontend que usa find_recoverable_client_user.
CREATE OR REPLACE FUNCTION public.register_client_access(
  p_user_id uuid,
  p_organization_id uuid,
  p_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'neon_auth'
AS $function$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_user_id IS NULL OR p_organization_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Usuário, empresa e e-mail são obrigatórios';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM neon_auth."user" u
    WHERE u.id = p_user_id AND lower(trim(u.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'Usuário de autenticação não encontrado ou e-mail divergente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM neon_auth.organization WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;

  -- Uma conta nunca pode ser transferida silenciosamente para outra empresa.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.app_users a
    WHERE a.user_id = p_user_id
      AND (a.system_role <> 'client_user' OR a.organization_id IS DISTINCT FROM p_organization_id)
  ) OR EXISTS (
    SELECT 1 FROM neon_auth.member m
    WHERE m."userId" = p_user_id AND m."organizationId" <> p_organization_id
  ) THEN
    RAISE EXCEPTION 'Esta conta já está vinculada a outro acesso ou empresa';
  END IF;

  -- Não apagar sessões nem filiações existentes no provedor de autenticação.
  IF NOT EXISTS (
    SELECT 1 FROM neon_auth.member m
    WHERE m."userId" = p_user_id AND m."organizationId" = p_organization_id
  ) THEN
    INSERT INTO neon_auth.member ("organizationId", "userId", role, "createdAt")
    VALUES (p_organization_id, p_user_id, 'member', now());
  END IF;

  INSERT INTO public.app_users (
    user_id, system_role, active, organization_id, email,
    must_change_password, temporary_password_set_at, created_at, updated_at
  ) VALUES (
    p_user_id, 'client_user', true, p_organization_id, v_email,
    true, clock_timestamp(), now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    active = true,
    email = EXCLUDED.email,
    must_change_password = true,
    temporary_password_set_at = clock_timestamp(),
    updated_at = now();
END;
$function$;

-- Só recupera usuário órfão criado por esta rotina, ainda bloqueado e sem qualquer vínculo.
CREATE OR REPLACE FUNCTION public.find_recoverable_client_user(
  p_email text,
  p_organization_id uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'neon_auth'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM neon_auth.organization WHERE id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;
  SELECT u.id INTO v_user_id
  FROM neon_auth."user" u
  WHERE lower(trim(u.email)) = lower(trim(coalesce(p_email, '')))
    AND u.banned IS TRUE
    AND u."banReason" = 'Falha ao vincular acesso à empresa.'
    AND coalesce(u.role, 'user') = 'user'
    AND NOT EXISTS (SELECT 1 FROM public.app_users a WHERE a.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM neon_auth.member m WHERE m."userId" = u.id)
  LIMIT 1;
  RETURN v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.find_recoverable_client_user(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_recoverable_client_user(text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_client_access(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_client_access(uuid, uuid, text) TO authenticated;
