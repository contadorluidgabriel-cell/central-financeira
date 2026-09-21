'use client';

import { neonTest } from './neon-test-client';
import { provisionClientAccess } from './client-access-flow.mjs';

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
  return provisionClientAccess({
    organizationId,
    email,
    name,
    auth: neonTest.auth,
    rpc: (functionName, params) => neonTest.rpc(functionName, params),
    generatePassword: generateTemporaryPassword
  });
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
