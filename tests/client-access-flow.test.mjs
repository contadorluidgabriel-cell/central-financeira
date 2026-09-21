import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionClientAccess } from '../lib/client-access-flow.mjs';

const args = overrides => ({
  organizationId: 'org-test', email: ' TEST@EXAMPLE.COM ', name: 'Empresa Teste',
  generatePassword: () => 'SenhaTemporaria123!',
  ...overrides
});

test('new access is created, linked and returns one temporary password', async () => {
  const calls = [];
  const auth = { admin: {
    createUser: async data => { calls.push(['create', data.email]); return { data: { user: { id: 'new-id' } } }; },
    banUser: async () => { throw new Error('Must not ban on success'); }
  } };
  const rpc = async (name, data) => {
    calls.push([name, data?.p_user_id || null]);
    return { data: name === 'find_recoverable_client_user' ? null : null };
  };
  const result = await provisionClientAccess(args({ auth, rpc }));
  assert.deepEqual(result, { userId: 'new-id', email: 'test@example.com', temporaryPassword: 'SenhaTemporaria123!' });
  assert.deepEqual(calls.map(c => c[0]), ['find_recoverable_client_user', 'create', 'register_client_access']);
});

test('interrupted access is recovered without creating a second auth user', async () => {
  const calls = [];
  const auth = { admin: {
    createUser: async () => { throw new Error('Should not create duplicate'); },
    setUserPassword: async ({ userId }) => { calls.push(['password', userId]); return { data: true }; },
    unbanUser: async ({ userId }) => { calls.push(['unban', userId]); return { data: true }; }
  } };
  const rpc = async (name, data) => {
    calls.push([name, data?.p_user_id || null]);
    return { data: name === 'find_recoverable_client_user' ? 'orphan-id' : null };
  };
  const result = await provisionClientAccess(args({ auth, rpc }));
  assert.equal(result.userId, 'orphan-id');
  assert.deepEqual(calls.map(c => c[0]), ['find_recoverable_client_user', 'password', 'register_client_access', 'unban']);
});

test('failed registration bans a new user and retains the original error', async () => {
  const calls = [];
  const auth = { admin: {
    createUser: async () => ({ data: { user: { id: 'unlinked' } } }),
    banUser: async ({ userId, banReason }) => { calls.push([userId, banReason]); return { data: true }; }
  } };
  const rpc = async name => ({ data: null, ...(name === 'register_client_access' ? { error: { message: 'Erro SQL verificável' } } : {}) });
  await assert.rejects(() => provisionClientAccess(args({ auth, rpc })), /Erro SQL verificável/);
  assert.deepEqual(calls, [['unlinked', 'Falha ao vincular acesso à empresa.']]);
});

test('failed recovery never unbans the orphan user', async () => {
  let unbanned = false;
  const auth = { admin: {
    setUserPassword: async () => ({ data: true }),
    unbanUser: async () => { unbanned = true; return { data: true }; }
  } };
  const rpc = async name => name === 'find_recoverable_client_user'
    ? { data: 'orphan-id' }
    : { error: { message: 'Falha persistente' } };
  await assert.rejects(() => provisionClientAccess(args({ auth, rpc })), /Falha persistente/);
  assert.equal(unbanned, false);
});

test('existing nonrecoverable email is never reassigned or reset', async () => {
  let registered = false;
  const auth = { admin: {
    createUser: async () => ({ error: { message: 'User already exists' } }),
    setUserPassword: async () => { throw new Error('Must not reset'); }
  } };
  const rpc = async name => { if (name === 'register_client_access') registered = true; return { data: null }; };
  await assert.rejects(() => provisionClientAccess(args({ auth, rpc })), /já possui uma conta/);
  assert.equal(registered, false);
});

test('failed preliminary lookup stops before creating a user', async () => {
  let created = false;
  const auth = { admin: { createUser: async () => { created = true; } } };
  await assert.rejects(() => provisionClientAccess(args({ auth, rpc: async () => ({ error: { message: 'RPC indisponível' } }) })), /RPC indisponível/);
  assert.equal(created, false);
});

test('failed unban marks linked access inactive', async () => {
  const calls = [];
  const auth = { admin: {
    setUserPassword: async () => ({ data: true }),
    unbanUser: async () => ({ error: { message: 'Bloqueado pelo provedor' } })
  } };
  const rpc = async (name, data) => {
    calls.push([name, data]);
    return { data: name === 'find_recoverable_client_user' ? 'orphan-id' : null };
  };
  await assert.rejects(() => provisionClientAccess(args({ auth, rpc })), /login permanece bloqueado/);
  assert.equal(calls.at(-1)[0], 'set_client_access_active');
  assert.equal(calls.at(-1)[1].p_active, false);
});
