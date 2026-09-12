'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { neonTest, neonTestConfigured } from '../lib/neon-test-client';

const BRANCH_LABEL = 'mcp-migration-2026-09-12T05-05-28';

function normalizeError(error) {
  if (!error) return 'Erro desconhecido.';
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || JSON.stringify(error);
}

function unwrap(result) {
  if (!result) return null;
  if (Object.prototype.hasOwnProperty.call(result, 'data')) return result.data;
  return result;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ConfigMissing() {
  return (
    <main className="content" style={{ maxWidth: 900, paddingTop: 48 }}>
      <section className="panel">
        <div className="panelhead"><div><h3>Neon ainda não configurado neste ambiente</h3><p>O código está pronto, mas faltam as variáveis públicas da branch de teste.</p></div></div>
        <div className="panelbody">
          <div className="notice" style={{ margin: 0 }}>
            Configure <b>NEXT_PUBLIC_NEON_AUTH_URL</b> e <b>NEXT_PUBLIC_NEON_DATA_API_URL</b> usando o arquivo <code>.env.example</code>.
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthCard({ onMessage }) {
  const [mode, setMode] = useState('signin');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    onMessage('');
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const name = String(form.get('name') || '').trim() || email.split('@')[0];

    try {
      const result = mode === 'signup'
        ? await neonTest.auth.signUp.email({ name, email, password })
        : await neonTest.auth.signIn.email({ email, password });

      if (result?.error) throw result.error;
      onMessage(mode === 'signup' ? 'Conta de teste criada.' : 'Login realizado.');
      window.location.reload();
    } catch (error) {
      onMessage(normalizeError(error), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-card" style={{ margin: '40px auto', width: 'min(440px, calc(100% - 32px))' }}>
      <div className="status info" style={{ marginBottom: 16 }}>AMBIENTE DE TESTE</div>
      <h2>{mode === 'signup' ? 'Criar acesso de teste' : 'Entrar no Neon'}</h2>
      <p>Autenticação real usando Neon Auth. Não use dados de clientes nesta branch.</p>
      <form onSubmit={submit}>
        {mode === 'signup' && <div className="field"><label>Nome</label><input className="input" name="name" required /></div>}
        <div className="field"><label>E-mail</label><input className="input" name="email" type="email" required /></div>
        <div className="field"><label>Senha</label><input className="input" name="password" type="password" minLength={8} required /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : 'Entrar'}</button>
      </form>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        {mode === 'signup' ? 'Já tenho conta' : 'Criar uma conta de teste'}
      </button>
    </div>
  );
}

function NeonConnectedPanel() {
  const session = neonTest.auth.useSession();
  const [organizations, setOrganizations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState({ text: '', error: false });
  const [busy, setBusy] = useState(false);

  const user = session.data?.user || null;
  const activeOrgId = session.data?.session?.activeOrganizationId || null;
  const activeOrg = useMemo(() => organizations.find(org => org.id === activeOrgId) || null, [organizations, activeOrgId]);

  const notify = useCallback((text, error = false) => setMessage({ text, error }), []);

  const loadOrganizations = useCallback(async () => {
    if (!user) return;
    try {
      const result = await neonTest.auth.organization.list();
      if (result?.error) throw result.error;
      const data = unwrap(result);
      setOrganizations(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(normalizeError(error), true);
    }
  }, [user, notify]);

  const loadEntries = useCallback(async () => {
    if (!activeOrgId) {
      setEntries([]);
      return;
    }
    try {
      const { data, error } = await neonTest
        .from('financial_entries')
        .select('id, competency, occurred_on, type, description, amount, mode, created_at')
        .eq('organization_id', activeOrgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      notify(normalizeError(error), true);
    }
  }, [activeOrgId, notify]);

  useEffect(() => { loadOrganizations(); }, [loadOrganizations]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  async function createOrganization(e) {
    e.preventDefault();
    setBusy(true);
    notify('');
    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') || '').trim();
    const slug = `${slugify(name)}-${Date.now().toString().slice(-5)}`;
    try {
      const result = await neonTest.auth.organization.create({ name, slug });
      if (result?.error) throw result.error;
      const org = unwrap(result);
      const organizationId = org?.id || org?.organization?.id;
      await loadOrganizations();
      if (organizationId) {
        const activeResult = await neonTest.auth.organization.setActive({ organizationId });
        if (activeResult?.error) throw activeResult.error;
        notify('Empresa de teste criada e selecionada. Recarregando sessão…');
        window.location.reload();
        return;
      }
      notify('Empresa criada. Selecione-a abaixo para continuar.');
      e.currentTarget.reset();
    } catch (error) {
      notify(normalizeError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function setActiveOrganization(id) {
    setBusy(true);
    notify('');
    try {
      const result = await neonTest.auth.organization.setActive({ organizationId: id });
      if (result?.error) throw result.error;
      notify('Empresa ativa alterada. Atualizando token e RLS…');
      window.location.reload();
    } catch (error) {
      notify(normalizeError(error), true);
      setBusy(false);
    }
  }

  async function addEntry(e) {
    e.preventDefault();
    if (!activeOrgId) return notify('Selecione uma empresa antes de lançar dados.', true);
    setBusy(true);
    notify('');
    const form = new FormData(e.currentTarget);
    const amount = Number(form.get('amount'));
    const description = String(form.get('description') || '').trim();
    try {
      const { error } = await neonTest.from('financial_entries').insert({
        organization_id: activeOrgId,
        competency: monthStart(),
        occurred_on: today(),
        type: 'revenue',
        description,
        amount,
        mode: 'individual'
      });
      if (error) throw error;
      e.currentTarget.reset();
      notify('Receita salva no Neon.');
      await loadEntries();
    } catch (error) {
      notify(normalizeError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmMonth() {
    if (!activeOrgId) return notify('Selecione uma empresa.', true);
    setBusy(true);
    notify('');
    try {
      const { error } = await neonTest.from('monthly_submissions').insert({
        organization_id: activeOrgId,
        competency: monthStart(),
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        revenue_no_movement: false,
        expense_no_movement: false,
        settings_snapshot: { source: 'neon-test-panel' }
      });
      if (error) throw error;
      notify('Competência confirmada. O RLS agora deve bloquear novos lançamentos deste mês.');
    } catch (error) {
      notify(normalizeError(error), true);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await neonTest.auth.signOut();
    window.location.reload();
  }

  if (session.isPending) {
    return <div className="empty"><strong>Validando sessão Neon…</strong></div>;
  }

  if (!user) {
    return <AuthCard onMessage={(text, error = false) => setMessage({ text, error })} />;
  }

  return (
    <div className="shell" style={{ gridTemplateColumns: '1fr' }}>
      <main className="main">
        <header className="topbar">
          <div className="crumb"><strong>Central Financeira</strong><span>›</span><span>Neon Test Lab</span></div>
          <div className="topright"><span className="status info">TESTE</span><button className="btn btn-secondary" onClick={signOut}>Sair</button></div>
        </header>
        <div className="content" style={{ maxWidth: 1180 }}>
          <div className="pagehead">
            <div><h1>Neon Test Lab</h1><p>Validação real de Auth, organizações, Data API e RLS antes de integrar o painel principal.</p></div>
          </div>

          <div className="notice" style={{ margin: '0 0 16px' }}>
            Branch isolada: <b>{BRANCH_LABEL}</b>. Use somente dados fictícios.
          </div>

          {message.text && <div className="notice" style={{ margin: '0 0 16px', color: message.error ? 'var(--danger)' : 'var(--text)', borderColor: message.error ? '#F2C9C5' : 'var(--border)' }}>{message.text}</div>}

          <div className="grid kpis" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
            <div className="card kpi"><span className="kpilabel">Usuário</span><div className="kpivalue" style={{ fontSize: 18, marginTop: 12 }}>{user.name || user.email}</div><div className="kpifoot">{user.email}</div></div>
            <div className="card kpi"><span className="kpilabel">Organizações</span><div className="kpivalue">{organizations.length}</div><div className="kpifoot">Criadas no Neon Auth</div></div>
            <div className="card kpi"><span className="kpilabel">Empresa ativa</span><div className="kpivalue" style={{ fontSize: 18, marginTop: 12 }}>{activeOrg?.name || 'Nenhuma'}</div><div className="kpifoot">Define o contexto de RLS</div></div>
          </div>

          <div className="grid sectiongrid">
            <section className="panel span6">
              <div className="panelhead"><div><h3>1. Organizações</h3><p>Crie uma empresa fictícia ou altere o contexto ativo.</p></div></div>
              <div className="panelbody">
                <form onSubmit={createOrganization}>
                  <div className="field"><label>Nome da empresa de teste</label><input className="input" name="name" placeholder="Empresa Teste Ltda" required /></div>
                  <button className="btn btn-primary" disabled={busy}>Criar empresa</button>
                </form>
                <div style={{ marginTop: 18 }}>
                  {organizations.length === 0 ? <p className="muted">Nenhuma organização ainda.</p> : organizations.map(org => (
                    <div className="setting" key={org.id}>
                      <div><h4>{org.name}</h4><p>{org.slug}</p></div>
                      <div className="settingactions"><button className={`btn ${org.id === activeOrgId ? 'btn-primary' : 'btn-secondary'}`} disabled={busy || org.id === activeOrgId} onClick={() => setActiveOrganization(org.id)}>{org.id === activeOrgId ? 'Ativa' : 'Usar esta'}</button></div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel span6">
              <div className="panelhead"><div><h3>2. Receita real no banco</h3><p>Grava em public.financial_entries usando Data API + RLS.</p></div></div>
              <div className="panelbody">
                <form onSubmit={addEntry}>
                  <div className="field"><label>Descrição</label><input className="input" name="description" placeholder="Venda de teste" required /></div>
                  <div className="field"><label>Valor</label><input className="input" name="amount" type="number" min="0.01" step="0.01" required /></div>
                  <button className="btn btn-primary" disabled={busy || !activeOrgId}>Salvar no Neon</button>
                </form>
                <div style={{ marginTop: 18 }}>
                  <button className="btn btn-secondary" disabled={busy || !activeOrgId} onClick={confirmMonth}>Confirmar competência e testar bloqueio</button>
                </div>
              </div>
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panelhead"><div><h3>Lançamentos visíveis para a empresa ativa</h3><p>Se o RLS estiver correto, trocar de organização deve trocar completamente esta lista.</p></div><button className="btn btn-secondary" onClick={loadEntries}>Atualizar</button></div>
            <div className="tablewrap">
              <table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Modo</th><th>Valor</th></tr></thead><tbody>
                {entries.length === 0 ? <tr><td colSpan="5" className="muted">Nenhum lançamento visível.</td></tr> : entries.map(entry => <tr key={entry.id}><td>{entry.occurred_on || '—'}</td><td>{entry.description}</td><td>{entry.type}</td><td>{entry.mode}</td><td>{Number(entry.amount || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td></tr>)}
              </tbody></table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function NeonTestPanel() {
  if (!neonTestConfigured) return <ConfigMissing />;
  return <NeonConnectedPanel />;
}
