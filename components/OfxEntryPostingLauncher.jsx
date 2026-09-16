'use client';

import { useEffect, useMemo, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import styles from './OfxEntryPostingLauncher.module.css';

const currency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const dateBR = value => String(value || '').slice(0, 10).split('-').reverse().join('/');
const tierLabel = { simple: 'Simples', basic: 'Básico', complete: 'Completo' };
const errorMessage = error => error?.message || error?.error_description || 'Não foi possível registrar os lançamentos.';

export default function OfxEntryPostingLauncher() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const [companies, setCompanies] = useState([]);
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [imports, setImports] = useState([]);
  const [choices, setChoices] = useState({});
  const [pendingOnly, setPendingOnly] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (session.isPending || !user) { setCompanies([]); return; }
      try {
        const role = await neonTest.from('app_users').select('system_role,active,must_change_password,organization_id').eq('user_id', user.id).limit(1);
        if (role.error) throw role.error;
        const appUser = role.data?.[0];
        if (!appUser?.active || appUser.must_change_password) { if (!cancelled) setCompanies([]); return; }
        const listing = await neonTest.auth.organization.list();
        if (listing.error) throw listing.error;
        let organizations = listing.data || [];
        if (appUser.system_role === 'client_user') organizations = organizations.filter(org => org.id === appUser.organization_id);
        const settings = await neonTest.from('organization_settings').select('organization_id,control_tier,active');
        if (settings.error) throw settings.error;
        const byId = new Map((settings.data || []).filter(item => item.active !== false && tierLabel[item.control_tier]).map(item => [item.organization_id, item.control_tier]));
        const allowed = organizations.filter(item => byId.has(item.id)).map(item => ({ id: item.id, name: item.name, tier: byId.get(item.id) }));
        if (!cancelled) {
          setCompanies(allowed);
          setOrganizationId(current => allowed.some(company => company.id === current) ? current : (allowed[0]?.id || ''));
        }
      } catch { if (!cancelled) setCompanies([]); }
    }
    resolve();
    return () => { cancelled = true; };
  }, [session.isPending, user?.id]);

  const company = companies.find(item => item.id === organizationId) || null;
  const importById = useMemo(() => new Map(imports.map(item => [item.id, item])), [imports]);
  const accountById = useMemo(() => new Map(accounts.map(item => [item.id, item.name])), [accounts]);
  const filteredRows = useMemo(() => rows.filter(item => !pendingOnly || !item.posted_at), [rows, pendingOnly]);
  const selected = useMemo(() => rows.filter(item => !item.posted_at && ['revenue', 'expense'].includes(choices[item.id]?.entryType)), [rows, choices]);
  const selectedRevenue = selected.filter(item => choices[item.id]?.entryType === 'revenue').reduce((sum, item) => sum + Number(item.amount), 0);
  const selectedExpenses = selected.filter(item => choices[item.id]?.entryType === 'expense').reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);

  async function load(organization) {
    if (!organization) return;
    setLoading(true); setError('');
    try {
      const [transactionsResult, categoriesResult, accountsResult, importsResult] = await Promise.all([
        neonTest.from('ofx_bank_transactions').select('id,import_id,posted_on,amount,description,posted_at,posting_type,posting_entry_id').eq('organization_id', organization).order('posted_on', { ascending: false }).limit(500),
        neonTest.from('financial_categories').select('id,organization_id,type,name,active').eq('organization_id', organization).eq('active', true),
        neonTest.from('finance_accounts').select('id,name').eq('organization_id', organization),
        neonTest.from('ofx_bank_imports').select('id,account_id,filename').eq('organization_id', organization)
      ]);
      for (const result of [transactionsResult, categoriesResult, accountsResult, importsResult]) if (result.error) throw result.error;
      setRows(transactionsResult.data || []);
      setCategories(categoriesResult.data || []);
      setAccounts(accountsResult.data || []);
      setImports(importsResult.data || []);
      setChoices({}); setAcknowledged(false);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open && organizationId) load(organizationId);
  }, [open, organizationId]);

  function changeChoice(id, patch) {
    setChoices(current => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }));
    setAcknowledged(false); setNotice('');
  }

  async function postSelected() {
    if (!company || !selected.length || selected.length > 100 || !acknowledged || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const pItems = selected.map(item => ({
        transactionId: item.id,
        entryType: choices[item.id].entryType,
        categoryId: choices[item.id].categoryId || null,
        description: (choices[item.id].description ?? item.description).trim()
      }));
      if (pItems.some(item => !item.description || item.description.length > 300)) throw new Error('Revise as descrições dos lançamentos selecionados.');
      const outcome = await neonTest.rpc('post_ofx_financial_entries', { p_organization_id: organizationId, p_items: pItems });
      if (outcome.error) throw outcome.error;
      const data = Array.isArray(outcome.data) ? outcome.data[0] : outcome.data;
      const result = data?.post_ofx_financial_entries || data || {};
      setNotice(`${Number(result.posted || 0)} lançamento(s) registrado(s). ${Number(result.alreadyPosted || 0)} já registrado(s) e ignorado(s). Atualize o painel financeiro para ver os novos valores.`);
      await load(organizationId);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  if (!user || !companies.length) return null;
  return <>
    <button type="button" className={styles.launcher} onClick={() => { setOpen(true); setError(''); setNotice(''); }} aria-label="Criar lançamentos a partir do OFX">Lançar do OFX</button>
    {open && <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="ofx-posting-title">
        <header className={styles.header}>
          <div><span className={styles.eyebrow}>Central Financeira · Extrato bancário</span><h2 id="ofx-posting-title">Criar lançamentos do OFX</h2><p>Converta movimentações já importadas em receitas ou despesas com confirmação individual.</p></div>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={() => !busy && setOpen(false)} disabled={busy}>×</button>
        </header>
        <div className={styles.body}>
          <div className={styles.notice}>Não marque transferências entre suas contas, estornos, empréstimos ou pagamentos já lançados como receita/despesa. <strong>Lançamentos manuais anteriores não são identificados automaticamente.</strong> O sistema bloqueia a repetição do mesmo movimento OFX e competências fechadas.</div>
          <div className={styles.toolbar}>
            <label>Empresa<select value={organizationId} disabled={busy} onChange={event => { setOrganizationId(event.target.value); setNotice(''); }}>{companies.map(item => <option key={item.id} value={item.id}>{item.name} · {tierLabel[item.tier]}</option>)}</select></label>
            <label className={styles.checkbox}><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)}/> Somente pendentes</label>
            <button type="button" onClick={() => load(organizationId)} disabled={busy || loading} className={styles.secondary}>{loading ? 'Atualizando…' : 'Atualizar lista'}</button>
          </div>
          {company?.tier === 'complete' && <p className={styles.hint}>No Controle Completo, cada lançamento também gera uma obrigação quitada e a movimentação de caixa na conta escolhida durante a importação.</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.success} role="status">{notice}</p>}
          <div className={styles.summary}><strong>{rows.filter(item => !item.posted_at).length} pendentes</strong><span>{rows.filter(item => item.posted_at).length} já lançados · mostrando até 500 movimentações recentes</span></div>
          <div className={styles.items}>
            {loading && <p className={styles.empty}>Carregando extratos…</p>}
            {!loading && !filteredRows.length && <p className={styles.empty}>Nenhuma movimentação nesta visualização. Importe primeiro um arquivo OFX pelo botão “Importar OFX”.</p>}
            {!loading && filteredRows.map(item => {
              const choice = choices[item.id] || {};
              const action = choice.entryType || '';
              const posting = Boolean(item.posted_at);
              const available = categories.filter(category => category.type === action);
              const source = importById.get(item.import_id);
              const accountName = source?.account_id ? accountById.get(source.account_id) : null;
              return <article className={styles.item} key={item.id}>
                <div className={styles.itemTop}>
                  <div><strong>{item.description}</strong><small>{dateBR(item.posted_on)}{source?.filename ? ` · ${source.filename}` : ''}{accountName ? ` · ${accountName}` : ''}</small></div>
                  <div className={styles.amount} data-negative={Number(item.amount) < 0}>{currency(item.amount)}<small>{posting ? 'Já lançado' : 'Pendente'}</small></div>
                </div>
                {!posting && <div className={styles.itemFields}>
                  <label>Registrar como<select value={action} disabled={busy} onChange={event => changeChoice(item.id, { entryType: event.target.value, categoryId: '' })}><option value="">Não lançar agora</option>{Number(item.amount) > 0 && <option value="revenue">Receita</option>}{Number(item.amount) < 0 && company?.tier !== 'simple' && <option value="expense">Despesa</option>}</select></label>
                  {action && <><label>Categoria<select value={choice.categoryId || ''} disabled={busy} onChange={event => changeChoice(item.id, { categoryId: event.target.value })}><option value="">Sem categoria</option>{available.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className={styles.description}>Descrição<input maxLength={300} value={choice.description ?? item.description} disabled={busy} onChange={event => changeChoice(item.id, { description: event.target.value })}/></label></>}
                </div>}
                {posting && <p className={styles.done}>Movimentação vinculada a um lançamento {item.posting_type === 'revenue' ? 'de receita' : 'de despesa'}.</p>}
              </article>;
            })}
          </div>
          <div className={styles.footer}>
            <div className={styles.totals}><strong>{selected.length} selecionado(s)</strong><span>Receitas: {currency(selectedRevenue)} · Despesas: {currency(selectedExpenses)}</span></div>
            {selected.length > 100 && <p className={styles.error} role="alert">O limite é de 100 lançamentos por confirmação. Desmarque alguns movimentos.</p>}
            <label className={styles.ack}><input type="checkbox" checked={acknowledged} disabled={!selected.length || busy} onChange={event => setAcknowledged(event.target.checked)}/> Conferi que estes movimentos são receitas ou despesas e não foram lançados anteriormente.</label>
            <button className={styles.primary} type="button" disabled={busy || loading || !acknowledged || !selected.length || selected.length > 100} onClick={postSelected}>{busy ? 'Registrando…' : `Registrar ${selected.length} lançamento(s)`}</button>
          </div>
        </div>
      </section>
    </div>}
  </>;
}
