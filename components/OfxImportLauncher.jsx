'use client';

import { useEffect, useMemo, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import { parseOfxFile } from '../lib/ofx-parser';
import styles from './OfxImportLauncher.module.css';

const money = amount => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount || 0));
const dateBR = value => String(value || '').split('-').reverse().join('/');
const tiers = { simple: 'Simples', basic: 'Básico', complete: 'Completo' };
const getError = error => error?.message || error?.error_description || 'Não foi possível concluir a operação.';

export default function OfxImportLauncher({ preferredOrganizationId = '', onReviewImported } = {}) {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const [context, setContext] = useState(null);
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState(preferredOrganizationId);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [recent, setRecent] = useState([]);
  const [parsed, setParsed] = useState(null);
  const [selected, setSelected] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewReady, setReviewReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (session.isPending || !user) { setContext(null); return; }
      try {
        const role = await neonTest.from('app_users').select('system_role,active,must_change_password,organization_id').eq('user_id', user.id).limit(1);
        if (role.error) throw role.error;
        const appUser = role.data?.[0];
        if (!appUser?.active || appUser.must_change_password) { setContext(null); return; }
        const listing = await neonTest.auth.organization.list();
        if (listing?.error) throw listing.error;
        let organizations = listing?.data || [];
        if (appUser.system_role === 'client_user') organizations = organizations.filter(org => org.id === appUser.organization_id);
        const settings = await neonTest.from('organization_settings').select('organization_id,control_tier,active');
        if (settings.error) throw settings.error;
        const byId = new Map((settings.data || []).filter(row => row.active !== false && tiers[row.control_tier]).map(row => [row.organization_id, row.control_tier]));
        const companies = organizations.filter(org => byId.has(org.id)).map(org => ({ id: org.id, name: org.name, tier: byId.get(org.id) }));
        if (!cancelled) {
          setContext({ companies });
          setOrganizationId(current => companies.some(c => c.id === current) ? current : (companies[0]?.id || ''));
        }
      } catch { if (!cancelled) setContext(null); }
    }
    resolve();
    return () => { cancelled = true; };
  }, [session.isPending, user?.id]);

  const company = context?.companies.find(item => item.id === organizationId) || null;
  const duplicateSet = useMemo(() => new Set(duplicates), [duplicates]);
  const selectable = useMemo(() => (parsed?.rows || []).filter(row => !row.errors.length && !duplicateSet.has(row.fitid)), [parsed, duplicateSet]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => (parsed?.rows || []).filter(row => filter === 'all' || (filter === 'in' ? Number(row.amount) > 0 : Number(row.amount) < 0)), [parsed, filter]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !organizationId) return;
      setError(''); setAccounts([]); setAccountId(''); setRecent([]);
      const [accountsResult, recentResult] = await Promise.all([
        neonTest.from('finance_accounts').select('id,name,kind,active').eq('organization_id', organizationId).eq('active', true),
        neonTest.from('ofx_bank_transactions').select('id,posted_on,amount,description,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(30)
      ]);
      if (cancelled) return;
      if (accountsResult.error || recentResult.error) {
        setError('A área de extratos OFX ainda não está disponível neste banco. Verifique se a migration foi aplicada.');
        return;
      }
      setAccounts(accountsResult.data || []);
      setRecent(recentResult.data || []);
    }
    load();
    return () => { cancelled = true; };
  }, [open, organizationId]);

  function changeCompany(value) {
    setOrganizationId(value); setParsed(null); setSelected([]); setDuplicates([]); setFilter('all'); setNotice(''); setError(''); setReviewReady(false);
  }

  async function chooseFile(file) {
    if (!file || !company) return;
    setBusy(true); setError(''); setNotice(''); setReviewReady(false); setParsed(null); setDuplicates([]); setSelected([]);
    try {
      const result = await parseOfxFile(file);
      const existing = await neonTest.from('ofx_bank_transactions').select('fitid').eq('organization_id', organizationId).eq('bank_ref', result.bankRef).limit(5000);
      if (existing.error) throw existing.error;
      const ids = new Set((existing.data || []).map(row => row.fitid));
      setDuplicates([...ids]);
      setParsed(result);
      setSelected(result.rows.filter(row => !row.errors.length && !ids.has(row.fitid)).map(row => row.rowNumber));
    } catch (err) { setError(getError(err)); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!company || !parsed || !selected.length || busy) return;
    if (company.tier === 'complete' && !accountId) { setError('Selecione a conta financeira correspondente ao extrato.'); return; }
    setBusy(true); setError(''); setNotice(''); setReviewReady(false);
    try {
      const rows = parsed.rows.filter(row => selectedSet.has(row.rowNumber) && !row.errors.length && !duplicateSet.has(row.fitid)).map(({ fitid, postedOn, amount, description, transactionType }) => ({ fitid, postedOn, amount, description, transactionType }));
      if (rows.length !== selected.length) throw new Error('Revise a seleção de movimentações.');
      const outcome = await neonTest.rpc('import_ofx_bank_statement', { p_organization_id: organizationId, p_account_id: company.tier === 'complete' ? accountId : null, p_bank_ref: parsed.bankRef, p_filename: parsed.fileName, p_rows: rows });
      if (outcome.error) throw outcome.error;
      const value = Array.isArray(outcome.data) ? outcome.data[0] : outcome.data;
      const result = value?.import_ofx_bank_statement || value || {};
      setNotice(`${Number(result.imported || 0)} movimentação(ões) guardada(s) para conferência. ${Number(result.duplicates || 0)} duplicada(s) ignorada(s). Nenhum saldo ou lançamento foi alterado.`);
      setReviewReady(Number(result.imported || 0) > 0);
      setParsed(null); setSelected([]); setDuplicates([]);
      const history = await neonTest.from('ofx_bank_transactions').select('id,posted_on,amount,description,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(30);
      if (!history.error) setRecent(history.data || []);
    } catch (err) { setError(getError(err)); }
    finally { setBusy(false); }
  }

  if (!user || !context?.companies.length) return null;
  return <>
    <button type="button" className={styles.launcher} onClick={() => { setOpen(true); setNotice(''); }} aria-label="Importar extrato OFX">Importar OFX</button>
    {open && <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="ofx-title">
        <header className={styles.heading}>
          <div><span className={styles.eyebrow}>Central Financeira · {tiers[company?.tier] || 'Extratos'}</span><h2 id="ofx-title">Importar extrato OFX</h2><p>Conferência de movimentações bancárias para os três controles.</p></div>
          <button type="button" className={styles.close} onClick={() => !busy && setOpen(false)} disabled={busy} aria-label="Fechar importação">×</button>
        </header>
        <div className={styles.body}>
          <div className={styles.alert}>O extrato fica separado do faturamento, das despesas e do caixa. A importação <strong>não cria receitas, pagamentos, baixas ou transferências</strong> automaticamente.</div>
          <div className={styles.fields}>
            <label>Empresa<select value={organizationId} onChange={event => changeCompany(event.target.value)} disabled={busy}>{context.companies.map(item => <option key={item.id} value={item.id}>{item.name} · {tiers[item.tier]}</option>)}</select></label>
            {company?.tier === 'complete' && <label>Conta financeira<select value={accountId} onChange={event => setAccountId(event.target.value)} disabled={busy}><option value="">Selecione a conta do extrato</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
          </div>
          {company?.tier === 'complete' && !accounts.length && <p className={styles.hint}>Cadastre uma conta financeira ativa no Controle Completo para vincular o OFX.</p>}
          <label className={styles.upload}><strong>{busy ? 'Processando arquivo…' : 'Selecionar arquivo .ofx'}</strong><span>OFX 1.x ou 2.x · até 2 MB e 500 movimentos · leitura local no navegador</span><input type="file" accept=".ofx" disabled={busy || !company || (company.tier === 'complete' && !accounts.length)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; chooseFile(file); }}/></label>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p role="status" className={styles.success}>{notice}</p>}
          {reviewReady && <div className={styles.nextActions} aria-label="Próxima etapa do extrato"><button type="button" className={styles.reviewAction} onClick={() => { setOpen(false); setReviewReady(false); onReviewImported?.(organizationId); }}>Revisar e lançar movimentações</button><button type="button" className={styles.laterAction} onClick={() => { setOpen(false); setReviewReady(false); }}>Fazer isso depois</button></div>}
          {parsed && <>
            <div className={styles.summary}><div><strong>{parsed.fileName}</strong><span>Conta {parsed.accountLabel} · {parsed.currency}{parsed.currencyAssumed ? ' (presumido)' : ''}</span></div><div><strong>{parsed.rows.length}</strong><span>movimentações</span></div><div><strong>{selectable.length}</strong><span>disponíveis</span></div><div><strong>{parsed.rows.length - selectable.length}</strong><span>duplicadas ou inválidas</span></div></div>
            <div className={styles.controls}><label><input type="checkbox" checked={selectable.length > 0 && selectable.every(row => selectedSet.has(row.rowNumber))} onChange={event => setSelected(event.target.checked ? selectable.map(row => row.rowNumber) : [])}/> Selecionar todas as linhas disponíveis</label><select value={filter} onChange={event => setFilter(event.target.value)} aria-label="Filtrar movimentações"><option value="all">Todas</option><option value="in">Entradas</option><option value="out">Saídas</option></select></div>
            <div className={styles.tableScroll}><table><thead><tr><th>Importar</th><th>Data</th><th>Histórico</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{visible.map(row => { const duplicate = duplicateSet.has(row.fitid); const invalid = row.errors.length > 0; return <tr key={row.rowNumber}><td><input type="checkbox" aria-label={`Selecionar linha ${row.rowNumber}`} disabled={invalid || duplicate || busy} checked={selectedSet.has(row.rowNumber)} onChange={event => setSelected(current => event.target.checked ? [...current, row.rowNumber] : current.filter(value => value !== row.rowNumber))}/></td><td>{dateBR(row.postedOn)}</td><td>{row.description}</td><td className={Number(row.amount) < 0 ? styles.out : styles.in}>{money(row.amount)}</td><td>{invalid ? row.errors.join(' ') : duplicate ? 'Já importada' : 'Pronta'}</td></tr>; })}</tbody></table></div>
            <div className={styles.footer}><p>{selected.length} selecionada(s). Reimportações do mesmo FITID são bloqueadas também no banco.</p><button type="button" className={styles.confirm} disabled={busy || selected.length === 0 || (company?.tier === 'complete' && !accountId)} onClick={confirm}>{busy ? 'Salvando…' : `Guardar ${selected.length} movimentação(ões)`}</button></div>
          </>}
          {!parsed && recent.length > 0 && <div className={styles.history}><h3>Movimentações já importadas</h3>{recent.slice(0, 10).map(item => <div key={item.id}><span>{dateBR(item.posted_on)} · {item.description}</span><strong>{money(item.amount)}</strong></div>)}<p>Últimos 10 movimentos. Esses valores ainda não são lançamentos de faturamento nem de caixa.</p></div>}
        </div>
      </section>
    </div>}
  </>;
}
