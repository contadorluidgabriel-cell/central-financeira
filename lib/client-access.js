'use client';

import { neonTest } from './neon-test-client';

function messageFrom(error, fallback = 'Não foi possível concluir a operação.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || error.code || fallback;
}

function ensureOk(result, fallback) {
  if (result?.error) throw new Error(messageFrom(result.error, fallback));
  return result?.data ?? result;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, n => alphabet[n % alphabet.length]).join('');
  return `A${body}a7!`;
}

export async function loadClientAccess() {
  const result = await neonTest.rpc('list_client_access');
  const rows = ensureOk(result, 'Não foi possível consultar os acessos dos clientes.') || [];
  return rows.map(row => ({
    userId: row.user_id,
    organizationId: row.organization_id,
    email: row.email || '',
    active: row.active !== false,
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null
  }));
}

export async function createClientAccess({ organizationId, email, name }) {
  const cleanEmail = normalizeEmail(email);
  if (!organizationId) throw new Error('Empresa não informada.');
  if (!cleanEmail) throw new Error('Informe o e-mail que será usado para entrar na Central.');

  const temporaryPassword = generateTemporaryPassword();
  const created = await neonTest.auth.admin.createUser({
    email: cleanEmail,
    password: temporaryPassword,
    name: String(name || 'Cliente').trim() || 'Cliente',
    role: 'user'
  });

  let user;
  try {
    const data = ensureOk(created, 'Não foi possível criar o usuário de acesso.');
    user = data?.user || data;
  } catch (error) {
    const message = messageFrom(error);
    if (/exist|already|registered|duplicate/i.test(message)) {
      throw new Error('Este e-mail já possui uma conta de acesso. Use a opção de redefinir senha ou escolha outro e-mail.');
    }
    throw error;
  }

  const userId = user?.id;
  if (!userId) throw new Error('O usuário foi criado, mas o identificador não foi retornado.');

  const linked = await neonTest.rpc('register_client_access', {
    p_user_id: userId,
    p_organization_id: organizationId,
    p_email: cleanEmail
  });

  if (linked?.error) {
    try {
      await neonTest.auth.admin.banUser({ userId, banReason: 'Falha ao vincular acesso à empresa.' });
    } catch {}
    throw new Error(messageFrom(linked.error, 'O usuário foi criado, mas não foi possível vinculá-lo à empresa.'));
  }

  return { userId, email: cleanEmail, temporaryPassword };
}

export async function resetClientPassword({ userId, email }) {
  if (!userId) throw new Error('Acesso do cliente não encontrado.');
  const temporaryPassword = generateTemporaryPassword();

  // Primeiro bloqueia o acesso financeiro e revoga sessões antigas no banco.
  // Só depois altera a credencial. Assim uma falha na segunda etapa não deixa
  // uma nova senha ativa sem o gate obrigatório de troca.
  const prepareResult = await neonTest.rpc('prepare_client_password_reset', { p_user_id: userId });
  ensureOk(prepareResult, 'Não foi possível preparar a redefinição de senha.');

  const passwordResult = await neonTest.auth.admin.setUserPassword({
    userId,
    newPassword: temporaryPassword
  });
  ensureOk(passwordResult, 'O acesso foi protegido, mas não foi possível definir a nova senha provisória. Tente novamente.');

  return { userId, email: normalizeEmail(email), temporaryPassword };
}

export async function setClientAccessBlocked({ userId, blocked }) {
  if (!userId) throw new Error('Acesso do cliente não encontrado.');

  if (blocked) {
    const authResult = await neonTest.auth.admin.banUser({
      userId,
      banReason: 'Acesso bloqueado pelo administrador da Central Financeira.'
    });
    ensureOk(authResult, 'Não foi possível bloquear o login.');

    const appResult = await neonTest.rpc('set_client_access_active', {
      p_user_id: userId,
      p_active: false
    });
    if (appResult?.error) throw new Error(messageFrom(appResult.error, 'O login foi bloqueado, mas o status interno não foi atualizado.'));
    return;
  }

  const appResult = await neonTest.rpc('set_client_access_active', {
    p_user_id: userId,
    p_active: true
  });
  if (appResult?.error) throw new Error(messageFrom(appResult.error, 'Não foi possível reativar o acesso interno.'));

  const authResult = await neonTest.auth.admin.unbanUser({ userId });
  ensureOk(authResult, 'O acesso interno foi reativado, mas o login continuou bloqueado.');
}

export async function completeFirstPasswordChange({ currentPassword, newPassword }) {
  if (!currentPassword) throw new Error('Informe a senha provisória usada no login.');
  if (!newPassword || newPassword.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');

  const changed = await neonTest.auth.changePassword({
    currentPassword,
    newPassword,
    revokeOtherSessions: true
  });
  ensureOk(changed, 'Não foi possível alterar a senha. Confira a senha provisória.');

  const completed = await neonTest.rpc('complete_client_password_change');
  if (completed?.error) throw new Error(messageFrom(completed.error, 'A senha foi alterada, mas a ativação do acesso não foi concluída.'));
}

export async function touchClientLogin() {
  const result = await neonTest.rpc('touch_client_login');
  if (result?.error) throw new Error(messageFrom(result.error, 'Não foi possível atualizar o último acesso.'));
}
