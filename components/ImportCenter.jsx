'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import { loadBasicControlData, importBasicExpenseRows } from '../lib/neon-basic-control';
import { importSimpleRevenueRows } from '../lib/neon-simple-control';
import SimpleRevenueImport from './SimpleRevenueImport';
import BasicExpenseImport from './BasicExpenseImport';
import OfxImportLauncher from './OfxImportLauncher';
import OfxEntryPostingLauncher from './OfxEntryPostingLauncher';
import styles from './ImportCenter.module.css';

const TIERS = { simple: 'Simples', basic: 'Básico', complete: 'Completo' };
const MODES = ['monthly', 'daily', 'individual'];
const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dateBR = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const modeLabel = (mode, type) => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: type === 'revenue' ? 'Cada receita' : 'Cada despesa' })[mode] || mode;
const errorText = error => error?.message || error?.error_description || 'Não foi possível concluir a operação.';

function modeFor(company, month, entries, submission, type) {
  const prop = type === 'revenue' ? 'revenueMode' : 'expenseMode';
  const snapshot = submission?.settings_snapshot?.[prop];
  if (MODES.includes(snapshot)) return snapshot;
  const existing = entries.filter(entry => entry.type === type && entry.entry_status === 'active');
  const aggregate = existing.find(entry => entry.mode === 'monthly' || entry.mode === 'daily');
  const recorded = aggregate || existing.find(entry => MODES.includes(entry.mode));
  if (recorded) return recorded.mode;
  const pendingMode = type === 'revenue' ? company.pendingRevenueMode : company.pendingExpenseMode;
  const pendingDate = type === 'revenue' ? company.pendingRevenueModeEffective : company.pendingExpenseModeEffective;
  if (pendingMode && pendingDate && month >= pendingDate) return pendingMode;
  return company[prop] || 'monthly';
}

export default function ImportCenter() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrgId = session.data?.session?.activeOrganizationId || null;
  const [data, setData] = useState(null);
  const [organizationId, setOrganizationId] = useState('');
  const [month, setMonth] = useState(monthNow());
  const [tab, setTab] = useState('spreadsheets');
  const [kind, setKind] = useState('revenue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accessError, setAccessError] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [history, setHistory] = useState([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const role = await neonTest.from('app_users').select('system_role,organization_id,active,must_change_password').eq('user_id', user.id).limit(1);
    if (role.error) throw role.error;
    const appUser = role.data?.[0];
    if (!appUser?.active || appUser.must_change_password) throw new Error('Este acesso precisa ser validado na página inicial antes de importar.');
    const next = await loadBasicControlData(activeOrgId);
    if (next.reload) { window.location.assign('/'); return; }
    const companies = next.companies.filter(company => TIERS[company.controlTier] && company.controlStartMonth && (appUser.system_role !== 'client_user' || company.id === appUser.organization_id));
    if (!companies.length) throw new Error('Nenhuma empresa configurada está disponível para este acesso.');
    setData({ ...next, companies });
    setOrganizationId(current => companies.some(company => company.id === current) ? current : (companies.find(company => company.id === activeOrgId)?.id || companies[0].id));
  }, [user?.id, activeOrgId]);

  useEffect(() => {
    if (session.isPending || !user) return;
    let cancelled = false;
    refresh().catch(err => { if (!cancelled) setAccessError(errorText(err)); });
    return () => { cancelled = true; };
  }, [session.isPending, user?.id, refresh]);

  const company = data?.companies.find(item => item.id === organizationId) || null;
  const entries = useMemo(() => data?.entries.filter(entry => entry.companyId === organizationId && entry.month === month) || [], [data, organizationId, month]);
  const submission = data?.submissions.find(item => item.companyId === organizationId && item.month === month) || null;
  const locked = submission?.status === 'confirmed';
  const effectiveMode = company ? modeFor(company, month, entries, submission, kind) : 'monthly';
  const categories = data?.categories.filter(item => item.organization_id === organizationId && item.type === kind) || [];
  const customers = data?.customers.filter(item => item.organization_id === organizationId && !item.merged_into) || [];
  const suppliers = data?.suppliers.filter(item => item.organization_id === organizationId && !item.merged_into) || [];
  const paymentMethods = data?.paymentMethods.filter(item => item.organization_id === organizationId) || [];
  const existingEntries = entries.filter(entry => entry.type === kind);
  const historyCounts = useMemo(() => history.reduce((map, record) => { const current = map.get(record.import_id) || { total: 0, posted: 0 }; current.total++; if (record.posted_at) current.posted++; map.set(record.import_id, current); return map; }, new Map()), [history]);

  useEffect(() => {
    if (tab !== 'history' || !organizationId) return;
    let cancelled = false;
    setHistoryBusy(true); setError('');
    Promise.all([
      neonTest.from('ofx_bank_imports').select('id,filename,created_at,account_id').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
      neonTest.from('ofx_bank_transactions').select('id,import_id,posted_at').eq('organization_id', organizationId).limit(5000)
    ]).then(([files, rows]) => {
      if (files.error || rows.error) throw files.error || rows.error;
      if (!cancelled) { setHistory(files.data || []); setHistoryRows(rows.data || []); }
    }).catch(err => { if (!cancelled) setError(errorText(err)); }).finally(() => { if (!cancelled) setHistoryBusy(false); });
    return () => { cancelled = true; };
  }, [tab, organizationId]);

  async function confirmSpreadsheet(rows) {
    if (!company || busy || locked) return null;
    setBusy(true); setError(''); setNotice('');
    try {
      const options = { organizationId, month, mode: effectiveMode, rows };
      const result = kind === 'revenue' ? await importSimpleRevenueRows(options) : await importBasicExpenseRows(options);
      await refresh();
      setResetKey(current => current + 1);
      setNotice(`${rows.length} ${kind === 'revenue' ? 'receita(s)' : 'despesa(s)'} importada(s) para ${month}. Confira os lançamentos no controle financeiro.`);
      return result ?? true;
    } catch (err) { setError(errorText(err)); return null; }
    finally { setBusy(false); }
  }

  function changeCompany(value) { setOrganizationId(value); setNotice(''); setError(''); setResetKey(value => value + 1); }
  function changeMonth(value) { setMonth(value); setNotice(''); setError(''); setResetKey(value => value + 1); }
  function changeKind(value) { setKind(value); setNotice(''); setError(''); setResetKey(value => value + 1); }

  if (session.isPending) return <main className={styles.center}>Carregando Importações…</main>;
  if (!user) return <main className={styles.center}><h1>Importações</h1><p>Entre na Central Financeira para acessar os arquivos da sua empresa.</p><a href="/" className={styles.primaryLink}>Ir para o login</a></main>;
  if (accessError) return <main className={styles.center}><h1>Acesso indisponível</h1><p role="alert">{accessError}</p><a href="/" className={styles.primaryLink}>Voltar à Central</a></main>;
  if (!data || !company) return <main className={styles.center}>Carregando dados da empresa…</main>;

  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.header}><div><a className={styles.back} href="/">← Voltar à Central Financeira</a><div className={styles.eyebrow}>GESTÃO DE ARQUIVOS</div><h1>Importações</h1><p>Importe planilhas e extratos em um único lugar, com prévia e confirmação antes de gravar.</p></div><div className={styles.mark}>LG</div></header>
      <section className={styles.toolbar} aria-label="Contexto da importação"><label>Empresa<select value={organizationId} onChange={event => changeCompany(event.target.value)} disabled={busy}>{data.companies.map(item => <option key={item.id} value={item.id}>{item.name} · {TIERS[item.controlTier]}</option>)}</select></label><div className={styles.scope}>Controle {TIERS[company.controlTier]}<small>Confira a empresa também ao abrir a ferramenta de OFX.</small></div></section>
      <nav className={styles.tabs} aria-label="Tipos de importação">{[['spreadsheets','Planilhas Excel/CSV'],['ofx','Extrato OFX'],['posting','Lançar do OFX'],['history','Histórico OFX']].map(([value, label]) => <button type="button" key={value} aria-current={tab === value ? 'page' : undefined} className={tab === value ? styles.activeTab : ''} onClick={() => { setTab(value); setError(''); setNotice(''); }}>{label}</button>)}</nav>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.success} role="status">{notice}</div>}
      {tab === 'spreadsheets' && <section className={styles.panel}><div className={styles.sectionHeader}><div><div className={styles.eyebrow}>IMPORTAÇÃO DE LANÇAMENTOS</div><h2>Planilhas Excel e CSV</h2><p>Os modelos e a validação dos arquivos permanecem iguais aos do controle financeiro.</p></div></div><div className={styles.controls}><label>Tipo de lançamento<select value={kind} onChange={event => changeKind(event.target.value)}><option value="revenue">Receitas</option>{company.controlTier !== 'simple' && <option value="expense">Despesas</option>}</select></label><label>Competência<input type="month" value={month} min={company.controlStartMonth} max={monthNow()} onChange={event => changeMonth(event.target.value)}/></label><div className={styles.scope}>Modo: {modeLabel(effectiveMode, kind)}</div></div>
        {locked ? <div className={styles.warning}>A competência {month} está concluída. Reabra o mês no controle financeiro antes de importar lançamentos.</div> : month < company.controlStartMonth || month > monthNow() ? <div className={styles.warning}>Selecione uma competência válida a partir de {company.controlStartMonth} e até o mês atual.</div> : <div className={styles.importPanel} key={`${organizationId}-${month}-${kind}-${resetKey}`}>{kind === 'revenue' ? <SimpleRevenueImport mode={effectiveMode} month={month} existingEntries={existingEntries} categories={categories} customers={customers} paymentMethods={paymentMethods} busy={busy} onConfirm={confirmSpreadsheet}/> : <BasicExpenseImport mode={effectiveMode} month={month} existingEntries={existingEntries} categories={categories} suppliers={suppliers} paymentMethods={paymentMethods} busy={busy} onConfirm={confirmSpreadsheet}/>}</div>}</section>}
      {tab === 'ofx' && <section className={styles.panel}><div className={styles.sectionHeader}><div><div className={styles.eyebrow}>ETAPA 1 · ARQUIVO BANCÁRIO</div><h2>Importar extrato OFX</h2><p>O arquivo entra como movimentações para conferência. Não altera faturamento nem saldo ao ser enviado.</p></div></div><div className={styles.ofxTool}><OfxImportLauncher/></div></section>}
      {tab === 'posting' && <section className={styles.panel}><div className={styles.sectionHeader}><div><div className={styles.eyebrow}>ETAPA 2 · CONFERÊNCIA</div><h2>Criar lançamentos a partir do OFX</h2><p>Selecione cada movimento, escolha receita ou despesa e confirme. Verifique lançamentos manuais para evitar duplicidades.</p></div></div><div className={styles.ofxTool}><OfxEntryPostingLauncher/></div></section>}
      {tab === 'history' && <section className={styles.panel}><div className={styles.sectionHeader}><div><div className={styles.eyebrow}>ARQUIVOS BANCÁRIOS</div><h2>Histórico de importações OFX</h2><p>Os arquivos originais não ficam armazenados: este histórico usa somente os registros de extrato. Planilhas ainda não têm histórico por arquivo.</p></div></div>{historyBusy ? <p>Carregando histórico…</p> : history.length ? <div className={styles.history}>{history.map(item => { const counts = historyCounts.get(item.id) || { total: 0, posted: 0 }; return <article className={styles.historyRow} key={item.id}><div><strong>{item.filename}</strong><small>{dateBR(item.created_at)} · {counts.total} movimento(s) · {counts.posted} lançado(s) · {counts.total - counts.posted} pendente(s)</small></div><span className={styles.pill}>{counts.posted === counts.total && counts.total > 0 ? 'Conferido' : 'Pendente'}</span></article>; })}</div> : <div className={styles.empty}>Nenhum extrato OFX importado para esta empresa.</div>}<p className={styles.hint}>São exibidos até 50 extratos recentes e contabilizados até 5.000 movimentos.</p></section>}
    </div>
  </main>;
}
