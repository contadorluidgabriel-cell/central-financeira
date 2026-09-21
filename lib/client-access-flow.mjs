// Orquestração testável do cadastro de acesso. Nenhuma senha é persistida aqui.
const messageFrom = (error, fallback = 'Não foi possível concluir a operação.') => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || error.code || fallback;
};

const unwrap = (result, fallback) => {
  if (result?.error) throw new Error(messageFrom(result.error, fallback));
  return result?.data ?? result;
};

export async function provisionClientAccess({ organizationId, email, name, auth, rpc, generatePassword }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!organizationId) throw new Error('Empresa não informada.');
  if (!cleanEmail) throw new Error('Informe o e-mail que será usado para entrar na Central.');
  if (!auth?.admin || typeof rpc !== 'function' || typeof generatePassword !== 'function') {
    throw new Error('Serviço de criação de acesso indisponível.');
  }

  // Consultar primeiro impede que uma falha anterior transforme o e-mail em cadastro irrecuperável.
  // A RPC só retorna contas bloqueadas pela falha de vínculo, sem app_users ou filiações.
  const recoverable = unwrap(
    await rpc('find_recoverable_client_user', { p_email: cleanEmail, p_organization_id: organizationId }),
    'Não foi possível verificar cadastros interrompidos.'
  );
  const recovering = Boolean(recoverable);
  const temporaryPassword = generatePassword();
  let userId = recovering ? recoverable : null;

  if (recovering) {
    unwrap(
      await auth.admin.setUserPassword({ userId, newPassword: temporaryPassword }),
      'Não foi possível preparar uma nova senha para o cadastro interrompido.'
    );
  } else {
    let created;
    try {
      created = unwrap(
        await auth.admin.createUser({
          email: cleanEmail,
          password: temporaryPassword,
          name: String(name || 'Cliente').trim() || 'Cliente',
          role: 'user'
        }),
        'Não foi possível criar o usuário de acesso.'
      );
    } catch (error) {
      if (/exist|already|registered|duplicate/i.test(messageFrom(error))) {
        throw new Error('Este e-mail já possui uma conta. Para acesso existente, use a redefinição de senha; não crie outro cadastro.');
      }
      throw error;
    }
    userId = (created?.user || created)?.id;
    if (!userId) throw new Error('O usuário foi criado, mas o identificador não foi retornado.');
  }

  try {
    unwrap(
      await rpc('register_client_access', {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_email: cleanEmail
      }),
      'Não foi possível vincular o acesso à empresa.'
    );
  } catch (error) {
    if (!recovering) {
      try {
        unwrap(
          await auth.admin.banUser({ userId, banReason: 'Falha ao vincular acesso à empresa.' }),
          'Não foi possível bloquear o usuário após a falha.'
        );
      } catch (banError) {
        throw new Error(`O vínculo falhou e o bloqueio preventivo também falhou: ${messageFrom(banError)}. Não envie a senha e solicite verificação do administrador.`);
      }
    }
    throw new Error(`A conta foi mantida bloqueada porque o vínculo com a empresa falhou: ${messageFrom(error)}. Tente novamente com o mesmo e-mail depois de corrigir o erro.`);
  }

  if (recovering) {
    try {
      unwrap(await auth.admin.unbanUser({ userId }), 'Não foi possível reativar o login recuperado.');
    } catch (error) {
      // Não mostrar um acesso como ativo se o provedor manteve a conta banida.
      try { await rpc('set_client_access_active', { p_user_id: userId, p_active: false }); } catch {}
      throw new Error(`Vínculo recuperado, mas o login permanece bloqueado: ${messageFrom(error)}. Reative o acesso na ficha do cliente.`);
    }
  }

  return { userId, email: cleanEmail, temporaryPassword };
}
