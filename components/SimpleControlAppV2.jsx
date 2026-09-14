'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import {
  SIMPLE_MODES,
  bootstrapSimpleOrganization,
  cancelSimpleRevenue,
  completeSimpleMonth,
  deleteSimpleRevenue,
  deleteUnusedSimpleCustomer,
  loadSimpleControlData,
  importSimpleRevenueRows,
  markSimpleNotificationRead,
  mergeSimpleCustomers,
  monthKey,
  nextMonth,
  normalizeSimpleError,
  previousMonth,
  reopenSimpleMonth,
  saveRevenueAdjustment,
  saveSimpleCategory,
  saveSimpleCustomer,
  saveSimplePaymentMethod,
  saveSimpleRevenue,
  scheduleRevenueMode,
  setSimpleCategoryActive,
  setSimpleCustomerActive,
  setSimplePaymentMethodActive,
  updateSimpleSettings
} from '../lib/neon-simple-control';
import styles from './SimpleControlApp.module.css';
import SimpleRevenueImport from './SimpleRevenueImport';
import { generateSimpleRevenuePdf } from '../lib/simple-report-pdf';
import { BASIC_EXPENSE_MODES, updateBasicSettings } from '../lib/neon-basic-control';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const today = () => new Date().toISOString().slice(0, 10);
const modeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada receita' })[mode] || mode;
const monthName = key => {
  const [year, month] = String(key).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)).replace(/^./, c => c.toUpperCase());
};
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const initials = value => String(value || 'LG').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const dayOf = value => Number(String(value || '').slice(8, 10) || 0);

function Icon({ name }) {
  const p = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/></>,
    users: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M18 8a3 3 0 0 1 0 6M22 21v-2a4 4 0 0 0-3-3.87"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6l-2 2M5.5 15A7 7 0 0 0 18 18l2-2"/></>,
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>
  };
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">{p[name] || p.money}</svg>;
}

const grossBilling = entries => entries.filter(e => e.entry_status === 'active').reduce((sum, e) => sum + Number(e.amount || 0), 0);
const adjustments = (entries, kind) => entries.filter(e => e.entry_status === 'adjustment' && e.adjustment_kind === kind).reduce((sum, e) => sum + Number(e.amount || 0), 0);
const netBilling = entries => grossBilling(entries) + adjustments(entries, 'positive') - adjustments(entries, 'negative');

function periodModeFor({ company, month, entries, submission }) {
  const snapshotMode = submission?.settings_snapshot?.revenueMode;
  if (SIMPLE_MODES.includes(snapshotMode)) return snapshotMode;
  const entryMode = entries.find(entry => entry.entry_status !== 'adjustment' && SIMPLE_MODES.includes(entry.mode))?.mode;
  if (entryMode) return entryMode;
  if (company.pendingRevenueMode && company.pendingRevenueModeEffective && month >= company.pendingRevenueModeEffective) return company.pendingRevenueMode;
  return company.revenueMode;
}

export default function SimpleControlAppV2() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [state, setState] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [view, setView] = useState('overview');
  const [month, setMonth] = useState(monthKey());
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', customer: '', payment: '' });
  const [bootstrapped, setBootstrapped] = useState({});

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const data = await loadSimpleControlData(activeOrganizationId);
      if (data.reload) { window.location.reload(); return; }
      setState(data);
      setSelectedCompanyId(current => current && data.companies.some(c => c.id === current) ? current : (data.companies[0]?.id || null));
    } catch (e) {
      setError(normalizeSimpleError(e));
    }
  }, [user?.id, activeOrganizationId]);

  useEffect(() => {
    if (session.isPending) return;
    if (!user) { setState(null); return; }
    refresh();
  }, [session.isPending, user?.id, refresh]);

  const company = state?.companies.find(c => c.id === selectedCompanyId) || null;

  useEffect(() => {
    if (!company || bootstrapped[company.id]) return;
    let cancelled = false;
    (async () => {
      try {
        await bootstrapSimpleOrganization(company.id);
        if (!cancelled) {
          setBootstrapped(prev => ({ ...prev, [company.id]: true }));
          await refresh();
        }
      } catch (e) {
        if (!cancelled) setError(normalizeSimpleError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  useEffect(() => {
    if (!company?.pendingRevenueMode || !company.pendingRevenueModeEffective || !state?.currentMonth) return;
    if (company.pendingRevenueModeEffective > state.currentMonth) return;
    let cancelled = false;
    (async () => {
      try {
        await updateSimpleSettings(company.id, {
          revenueMode: company.pendingRevenueMode,
          pendingRevenueMode: null,
          pendingRevenueModeEffective: null
        });
        if (!cancelled) await refresh();
      } catch (e) {
        if (!cancelled) setError(normalizeSimpleError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id, company?.pendingRevenueMode, company?.pendingRevenueModeEffective, state?.currentMonth]);

  const run = async (action, success) => {
    setBusy(true); setError('');
    try {
      const result = await action();
      await refresh();
      if (success) setToast(success);
      return result;
    } catch (e) {
      const message = normalizeSimpleError(e);
      setError(message); setToast(message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  async function signIn(event) {
    event.preventDefault();
    setAuthBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await neonTest.auth.signIn.email({ email: String(form.get('email') || '').trim(), password: String(form.get('password') || '') });
      if (result?.error) throw result.error;
      window.location.reload();
    } catch (e) {
      setError(normalizeSimpleError(e)); setAuthBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); window.location.reload(); }
    catch (e) { setError(normalizeSimpleError(e)); setBusy(false); }
  }

  if (session.isPending) return <Center text="Carregando Central Financeira…"/>;
  if (!user) return <Login onSubmit={signIn} busy={authBusy} error={error}/>;
  if (!state) return <Center text="Organizando seu faturamento…"/>;
  if (!company) return <div className={styles.center}><div className={styles.emptyCard}><h2>Nenhuma empresa disponível</h2><p>Este acesso ainda não está vinculado a uma organização financeira.</p><button className={styles.secondaryButton} onClick={signOut}>Sair</button></div></div>;

  const categories = state.categories.filter(row => row.organization_id === company.id && row.type === 'revenue');
  const customers = state.customers.filter(row => row.organization_id === company.id && !row.merged_into);
  const paymentMethods = state.paymentMethods.filter(row => row.organization_id === company.id);
  const currentEntries = state.entries.filter(entry => entry.companyId === company.id && entry.month === month);
  const currentSubmission = state.submissions.find(item => item.companyId === company.id && item.month === month) || null;
  const periodMode = periodModeFor({ company, month, entries: currentEntries, submission: currentSubmission });
  const locked = currentSubmission?.status === 'confirmed';
  const status = currentSubmission?.status === 'confirmed' ? 'Concluído' : currentSubmission?.status === 'reopened' ? 'Reaberto' : 'Em andamento';
  const previousKey = previousMonth(month);
  const previousEntries = state.entries.filter(entry => entry.companyId === company.id && entry.month === previousKey);
  const startMonth = company.controlStartMonth || month;
  const previousSubmission = state.submissions.find(item => item.companyId === company.id && item.month === previousKey) || null;
  const previousPending = previousKey >= startMonth && previousKey < state.currentMonth && !previousSubmission;

  if (!company.controlStartMonth) {
    return <Onboarding company={company} busy={busy} onSave={async ({ tier, revenueMode, expenseMode, startMonth: initialMonth }) => {
      const result = await run(async () => {
        await updateBasicSettings(company.id, {
          controlTier: tier,
          controlStartMonth: initialMonth,
          revenueMode,
          expenseEnabled: tier === 'basic',
          expenseMode: tier === 'basic' ? expenseMode : 'monthly'
        });
        setMonth(initialMonth);
      }, tier === 'basic' ? 'Controle Básico configurado.' : 'Controle Simples configurado.');
      if (result !== null && tier === 'basic') window.location.reload();
    }} onLogout={signOut}/>;
  }

  const navigate = target => { setView(target); setSearch(''); setFilters({ category: '', customer: '', payment: '' }); };
  const currentControlIsIndividual = company.revenueMode === 'individual';

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><div className={styles.brandMark}>LG</div><div><strong>Central Financeira</strong><span>Controle Simples</span></div></div>
      {state.systemRole === 'super_admin' && <div className={styles.companyPicker}><label>Empresa em teste</label><select value={company.id} onChange={e => { setSelectedCompanyId(e.target.value); setView('overview'); }}>
        {state.companies.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></div>}
      <nav className={styles.nav}>
        <NavButton active={view === 'overview'} icon="home" label="Início" onClick={() => navigate('overview')}/>
        <NavButton active={view === 'revenues'} icon="money" label="Receitas" onClick={() => navigate('revenues')}/>
        {currentControlIsIndividual && <NavButton active={view === 'customers'} icon="users" label="Clientes" onClick={() => navigate('customers')}/>} 
        <NavButton active={view === 'reports'} icon="chart" label="Relatórios" onClick={() => navigate('reports')}/>
        <NavButton active={view === 'closing'} icon="check" label="Fechamento do mês" onClick={() => navigate('closing')}/>
        <NavButton active={view === 'settings'} icon="settings" label="Configurações" onClick={() => navigate('settings')}/>
      </nav>
      <div className={styles.sidebarFooter}><button onClick={signOut}><Icon name="logout"/>Sair</button></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}>
        <div><strong>{company.name}</strong><span>{modeName(periodMode)} · faturamento bruto{periodMode !== company.revenueMode ? ' · modo histórico' : ''}</span></div>
        <div className={styles.topActions}><MonthPicker value={month} startMonth={startMonth} onChange={setMonth}/><div className={styles.avatar}>{initials(user.name || user.email)}</div></div>
      </header>

      <div className={styles.content}>
        {error && <div className={styles.errorBanner}><Icon name="alert"/><span>{error}</span></div>}
        {previousPending && <button className={styles.reminder} onClick={() => { setMonth(previousKey); setView('closing'); }}><Icon name="alert"/><div><strong>{monthName(previousKey)} ainda não foi concluído</strong><span>Revise os lançamentos e conclua o mês.</span></div><Icon name="arrow"/></button>}
        {state.systemRole === 'super_admin' && <NotificationStrip notifications={state.notifications.filter(n => !n.read_at).slice(0, 3)} onRead={id => run(() => markSimpleNotificationRead(id), '')}/>} 

        {view === 'overview' && <Overview mode={periodMode} month={month} entries={currentEntries} previousEntries={previousEntries} status={status} locked={locked} onAdd={() => setModal({ type: 'revenue' })} onClosing={() => setView('closing')} onViewRevenues={() => setView('revenues')}/>} 
        {view === 'revenues' && <Revenues mode={periodMode} month={month} currentMonth={state.currentMonth} entries={currentEntries} categories={categories} customers={customers} paymentMethods={paymentMethods} locked={locked} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} onAdd={() => setModal({ type: 'revenue' })} onImport={() => setModal({ type: 'import' })} onEdit={entry => setModal({ type: 'revenue', entry })} onDelete={entry => run(() => deleteSimpleRevenue(entry.id), 'Receita excluída.')} onCancel={entry => setModal({ type: 'cancel', entry })} onAdjustment={() => setModal({ type: 'adjustment' })}/>} 
        {view === 'customers' && currentControlIsIndividual && <Customers customers={customers} allEntries={state.entries.filter(e => e.companyId === company.id)} search={search} setSearch={setSearch} onCreate={() => setModal({ type: 'customer' })} onEdit={customer => setModal({ type: 'customer', customer })} onToggle={customer => run(() => setSimpleCustomerActive(customer.id, !customer.active), customer.active ? 'Cliente inativado.' : 'Cliente reativado.')} onDelete={customer => run(() => deleteUnusedSimpleCustomer(customer.id), 'Cliente excluído.')} onOpen={customer => setModal({ type: 'customerDetail', customer })} onMerge={() => setModal({ type: 'mergeCustomer' })}/>} 
        {view === 'reports' && <Reports mode={periodMode} company={company} month={month} entries={state.entries.filter(e => e.companyId === company.id)}/>} 
        {view === 'closing' && <Closing month={month} currentMonth={state.currentMonth} entries={currentEntries} submission={currentSubmission} status={status} busy={busy} onComplete={noMovement => run(() => completeSimpleMonth({ organizationId: company.id, month, revenueMode: periodMode, noMovement }), 'Mês concluído.')} onReopen={() => setModal({ type: 'reopen' })}/>} 
        {view === 'settings' && <Settings company={company} categories={categories} paymentMethods={paymentMethods} currentMonth={state.currentMonth} onScheduleMode={mode => run(() => scheduleRevenueMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança programada para ${monthName(nextMonth(state.currentMonth))}.`)} onAddCategory={() => setModal({ type: 'category' })} onEditCategory={category => setModal({ type: 'category', category })} onToggleCategory={category => run(() => setSimpleCategoryActive(category.id, !category.active), category.active ? 'Categoria inativada.' : 'Categoria reativada.')} onAddPayment={() => setModal({ type: 'payment' })} onEditPayment={payment => setModal({ type: 'payment', payment })} onTogglePayment={payment => run(() => setSimplePaymentMethodActive(payment.id, !payment.active), payment.active ? 'Meio de pagamento inativado.' : 'Meio de pagamento reativado.')}/>} 
      </div>
    </main>

    <MobileNav view={view} individual={currentControlIsIndividual} onNavigate={navigate}/>

    {modal && <Modal title={modalTitle(modal.type)} wide={modal.type === 'import'} onClose={() => !busy && setModal(null)}>
      {modal.type === 'revenue' && <RevenueForm mode={periodMode} month={month} entry={modal.entry} draft={modal.draft} categories={categories.filter(c => c.active)} customers={customers.filter(c => c.active)} paymentMethods={paymentMethods.filter(p => p.active)} busy={busy} onQuickCustomer={draft => setModal({ type: 'customer', returnToRevenue: true, revenueDraft: draft })} onSubmit={async payload => {
        const consumer = customers.find(c => c.is_consumer_final);
        const finalPayload = periodMode === 'individual' && !payload.customerId ? { ...payload, customerId: consumer?.id || null } : payload;
        const result = await run(() => saveSimpleRevenue({ ...finalPayload, existingId: modal.entry?.id || null, organizationId: company.id, month, mode: periodMode }), modal.entry ? 'Receita atualizada.' : 'Receita registrada.');
        if (result !== null) setModal(null);
      }}/>} 
      {modal.type === 'import' && <SimpleRevenueImport mode={periodMode} month={month} existingEntries={currentEntries} categories={categories} customers={customers} paymentMethods={paymentMethods} busy={busy} onConfirm={async rows => {
        const result = await run(() => importSimpleRevenueRows({ organizationId: company.id, month, mode: periodMode, rows }), `${rows.length} ${rows.length === 1 ? 'receita importada' : 'receitas importadas'}.`);
        if (result !== null) setModal(null);
        return result;
      }}/>} 
      {modal.type === 'customer' && <CustomerForm customer={modal.customer} busy={busy} onSubmit={async payload => {
        const sameName = customers.find(c => c.id !== modal.customer?.id && c.name.toLowerCase() === payload.name.trim().toLowerCase());
        const sameDocument = payload.document && customers.find(c => c.id !== modal.customer?.id && String(c.document || '').replace(/\D/g, '') === String(payload.document).replace(/\D/g, ''));
        if (sameDocument && !window.confirm(`O CPF/CNPJ informado já aparece em ${sameDocument.name}. Revise os dados. Deseja salvar mesmo assim?`)) return;
        if (sameName && !window.confirm(`Já existe um cliente chamado ${sameName.name}. Deseja continuar mesmo assim?`)) return;
        const id = await run(() => saveSimpleCustomer({ ...payload, organizationId: company.id, existingId: modal.customer?.id || null }), modal.customer ? 'Cliente atualizado.' : 'Cliente cadastrado.');
        if (id !== null) {
          if (modal.returnToRevenue) setModal({ type: 'revenue', draft: { ...(modal.revenueDraft || {}), customerId: id } });
          else setModal(null);
        }
      }}/>} 
      {modal.type === 'customerDetail' && <CustomerDetail customer={modal.customer} entries={state.entries.filter(e => e.companyId === company.id && e.customer_id === modal.customer.id)}/>} 
      {modal.type === 'mergeCustomer' && <MergeCustomerForm customers={customers.filter(c => !c.is_consumer_final)} busy={busy} onSubmit={async payload => { const result = await run(() => mergeSimpleCustomers({ organizationId: company.id, ...payload }), 'Clientes mesclados.'); if (result !== null) setModal(null); }}/>} 
      {modal.type === 'category' && <NameForm label="Categoria" initial={modal.category?.name} busy={busy} onSubmit={async name => { const result = await run(() => saveSimpleCategory({ organizationId: company.id, existingId: modal.category?.id || null, name }), modal.category ? 'Categoria atualizada.' : 'Categoria criada.'); if (result !== null) setModal(null); }}/>} 
      {modal.type === 'payment' && <NameForm label="Meio de pagamento" initial={modal.payment?.name} busy={busy} onSubmit={async name => { const result = await run(() => saveSimplePaymentMethod({ organizationId: company.id, existingId: modal.payment?.id || null, name }), modal.payment ? 'Meio de pagamento atualizado.' : 'Meio de pagamento criado.'); if (result !== null) setModal(null); }}/>} 
      {modal.type === 'adjustment' && <AdjustmentForm month={month} busy={busy} onSubmit={async payload => { const result = await run(() => saveRevenueAdjustment({ ...payload, organizationId: company.id, month }), 'Ajuste registrado.'); if (result !== null) setModal(null); }}/>} 
      {modal.type === 'cancel' && <CancelForm entry={modal.entry} locked={locked} month={month} currentMonth={state.currentMonth} busy={busy} onSubmit={async reason => {
        if (locked && month === state.currentMonth) { setError('Reabra o mês atual antes de cancelar esta receita.'); setModal(null); return; }
        const historical = locked && month < state.currentMonth;
        const action = historical
          ? () => saveRevenueAdjustment({ organizationId: company.id, month: state.currentMonth, date: today(), amount: modal.entry.amount, direction: 'negative', description: `Estorno de ${monthName(month)}: ${modal.entry.description || 'receita'}. ${reason}`, sourceEntryId: modal.entry.id })
          : () => cancelSimpleRevenue({ entryId: modal.entry.id, reason });
        const result = await run(action, historical ? 'Estorno registrado no mês atual.' : 'Receita cancelada.');
        if (result !== null) setModal(null);
      }}/>} 
      {modal.type === 'reopen' && <ReopenForm month={month} busy={busy} onSubmit={async reason => { const result = await run(() => reopenSimpleMonth({ organizationId: company.id, month, reason, actorUserId: user.id, organizationName: company.name }), 'Mês reaberto.'); if (result !== null) setModal(null); }}/>} 
    </Modal>}

    {toast && <div className={styles.toast}>{toast}</div>}
  </div>;
}

function Center({ text }) {
  return <div className={styles.center}><div className={styles.loader}/><span>{text}</span></div>;
}

function Login({ onSubmit, busy, error }) {
  return <div className={styles.loginPage}>
    <div className={styles.loginVisual}>
      <div className={styles.loginBrand}><div className={styles.brandMark}>LG</div><div><strong>Central Financeira</strong><span>Contador Luid Gabriel</span></div></div>
      <div className={styles.loginCopy}><span>Controle Simples</span><h1>Seu faturamento organizado, sem complicar sua rotina.</h1><p>Registre vendas e serviços, acompanhe a evolução do mês e mantenha um histórico confiável para você e seu contador.</p></div>
    </div>
    <form className={styles.loginCard} onSubmit={onSubmit}>
      <div><span className={styles.eyebrow}>Acesso seguro</span><h2>Entrar na Central</h2><p>Use o e-mail e a senha vinculados à sua empresa.</p></div>
      {error && <div className={styles.formError}>{error}</div>}
      <label>E-mail<input name="email" type="email" required autoComplete="email" placeholder="seuemail@empresa.com"/></label>
      <label>Senha<input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha"/></label>
      <button className={styles.primaryButton} disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <div className={styles.infoBox}><strong>Ambiente de teste</strong><span>Este preview está conectado somente à estrutura de testes da Central Financeira.</span></div>
    </form>
  </div>;
}

function Onboarding({ company, busy, onSave, onLogout }) {
  const [tier, setTier] = useState('simple');
  const [revenueMode, setRevenueMode] = useState(company.revenueMode || 'monthly');
  const [expenseMode, setExpenseMode] = useState('monthly');
  const [startMonth, setStartMonth] = useState(monthKey());
  return <div className={styles.onboarding}><div className={styles.onboardingCard}>
    <div className={styles.onboardingTop}><div className={styles.brandMark}>LG</div><button onClick={onLogout}>Sair</button></div>
    <span className={styles.eyebrow}>Configuração da sua Central</span>
    <h1>Como você quer controlar sua empresa?</h1>
    <p>A escolha é sua. O contador acompanha a configuração, mas não escolhe o nível nem o modo por você. Você pode começar mais simples e evoluir depois.</p>

    <p><strong>1. Escolha o nível de controle</strong></p>
    <div className={styles.modeGrid}>
      <button type="button" className={`${styles.modeCard} ${tier === 'simple' ? styles.modeCardActive : ''}`} onClick={() => setTier('simple')}>
        <strong>Controle Simples</strong><span>Acompanha apenas faturamento. Ideal para quem quer começar sem registrar despesas.</span>
      </button>
      <button type="button" className={`${styles.modeCard} ${tier === 'basic' ? styles.modeCardActive : ''}`} onClick={() => setTier('basic')}>
        <strong>Controle Básico</strong><span>Acompanha faturamento, despesas e resultado gerencial, sem contas a pagar, receber ou caixa.</span>
      </button>
    </div>

    <p><strong>2. Como você prefere registrar seu faturamento?</strong> Mudanças futuras passam a valer no mês seguinte para preservar o histórico.</p>
    <div className={styles.modeGrid}>{SIMPLE_MODES.map(item => <button type="button" className={`${styles.modeCard} ${revenueMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setRevenueMode(item)}><strong>{modeName(item)}</strong><span>{item === 'monthly' ? 'Informe apenas quanto faturou no mês.' : item === 'daily' ? 'Informe quanto faturou em cada dia.' : 'Registre cada venda ou serviço com detalhes opcionais.'}</span></button>)}</div>

    {tier === 'basic' && <>
      <p><strong>3. Como você prefere registrar suas despesas?</strong></p>
      <div className={styles.modeGrid}>{BASIC_EXPENSE_MODES.map(item => <button type="button" className={`${styles.modeCard} ${expenseMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setExpenseMode(item)}><strong>{item === 'monthly' ? 'Total do mês' : 'Cada despesa'}</strong><span>{item === 'monthly' ? 'Informe apenas o total de gastos do mês.' : 'Registre cada gasto com fornecedor, categoria e pagamento opcionais.'}</span></button>)}</div>
    </>}

    <div className={styles.onboardingFields}>
      <label>Mês inicial<input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)}/></label>
      <div className={styles.infoBox}><strong>Como os valores são interpretados</strong><span>Receita significa faturamento bruto da venda ou serviço. No Básico, despesa significa gasto do negócio referente ao período. A Central não presume recebimento, pagamento ou saldo bancário.</span></div>
    </div>
    <button className={styles.primaryButton} disabled={busy || !startMonth} onClick={() => onSave({ tier, revenueMode, expenseMode, startMonth })}>{busy ? 'Configurando…' : tier === 'basic' ? 'Usar Controle Básico' : 'Usar Controle Simples'}</button>
  </div></div>;
}

function NavButton({ active, icon, label, onClick }) {
  return <button className={`${styles.navButton} ${active ? styles.navButtonActive : ''}`} onClick={onClick}><Icon name={icon}/><span>{label}</span></button>;
}

function MonthPicker({ value, startMonth, onChange }) {
  return <label className={styles.monthPicker}><Icon name="calendar"/><input type="month" min={startMonth || undefined} value={value} onChange={e => onChange(e.target.value)}/></label>;
}

function PageHeader({ title, description, children }) {
  return <div className={styles.pageHeader}><div><h1>{title}</h1><p>{description}</p></div>{children && <div className={styles.pageActions}>{children}</div>}</div>;
}

function Overview({ mode, month, entries, previousEntries, status, locked, onAdd, onClosing, onViewRevenues }) {
  const gross = grossBilling(entries);
  const negative = adjustments(entries, 'negative');
  const positive = adjustments(entries, 'positive');
  const net = netBilling(entries);
  const activeEntries = entries.filter(e => e.entry_status === 'active');
  const comparisonCurrent = month === monthKey() && mode !== 'monthly' ? activeEntries.filter(e => dayOf(e.date) <= new Date().getDate()) : activeEntries;
  const comparisonPrevious = month === monthKey() && mode !== 'monthly' ? previousEntries.filter(e => e.entry_status === 'active' && dayOf(e.date) <= new Date().getDate()) : previousEntries.filter(e => e.entry_status === 'active');
  const currentComparable = grossBilling(comparisonCurrent);
  const previousComparable = grossBilling(comparisonPrevious);
  const variation = previousComparable ? ((currentComparable - previousComparable) / previousComparable) * 100 : null;
  const byDay = new Map();
  activeEntries.forEach(entry => byDay.set(entry.date, (byDay.get(entry.date) || 0) + Number(entry.amount || 0)));
  const bestDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const byCategory = new Map();
  const byCustomer = new Map();
  const byPayment = new Map();
  activeEntries.forEach(entry => {
    if (entry.category?.name) byCategory.set(entry.category.name, (byCategory.get(entry.category.name) || 0) + entry.amount);
    if (entry.customer?.name) byCustomer.set(entry.customer.name, (byCustomer.get(entry.customer.name) || 0) + entry.amount);
    if (entry.paymentMethod?.name) byPayment.set(entry.paymentMethod.name, (byPayment.get(entry.paymentMethod.name) || 0) + entry.amount);
  });
  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const topCustomer = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const topPayment = [...byPayment.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const ticket = activeEntries.length ? gross / activeEntries.length : 0;

  return <>
    <PageHeader title={monthName(month)} description={`${status} · ${modeName(mode)}`}>{!locked && <button className={styles.primaryButtonSmall} onClick={onAdd}><Icon name="plus"/>Registrar receita</button>}</PageHeader>
    <section className={styles.heroCard}><div><span>Faturamento após ajustes</span><strong>{money(net)}</strong><p>{variation === null ? 'Sem base suficiente para comparação.' : <>{variation >= 0 ? '+' : ''}{percent(variation)} em relação {month === monthKey() && mode !== 'monthly' ? 'ao mesmo período do mês anterior' : 'ao mês anterior'}.</>}</p></div><div className={styles.heroBreakdown}><div><span>Faturamento bruto</span><b>{money(gross)}</b></div><div><span>Ajustes positivos</span><b>{money(positive)}</b></div><div><span>Estornos / ajustes</span><b>{money(negative)}</b></div></div></section>
    <div className={styles.metricGrid}>
      {mode !== 'monthly' && <Metric label={mode === 'daily' ? 'Dias com movimento' : 'Receitas registradas'} value={mode === 'daily' ? byDay.size : activeEntries.length} detail={mode === 'daily' ? `Média ${money(byDay.size ? gross / byDay.size : 0)} por dia` : `Ticket médio ${money(ticket)}`}/>} 
      {mode !== 'monthly' && <Metric label="Melhor dia" value={bestDay ? formatDate(bestDay[0]) : '—'} detail={bestDay ? money(bestDay[1]) : 'Sem movimento'}/>} 
      {mode === 'individual' && <Metric label="Categoria principal" value={topCategory?.[0] || '—'} detail={topCategory ? money(topCategory[1]) : 'Sem categoria'}/>} 
      {mode === 'individual' && <Metric label="Cliente principal" value={topCustomer?.[0] || '—'} detail={topCustomer ? money(topCustomer[1]) : 'Sem cliente identificado'}/>} 
      {mode === 'individual' && <Metric label="Meio mais usado" value={topPayment?.[0] || '—'} detail={topPayment ? money(topPayment[1]) : 'Não informado'}/>} 
    </div>
    <section className={styles.panel}><div className={styles.panelHead}><div><h3>Últimas receitas</h3><p>O dado exibido aqui é faturamento, não saldo em conta.</p></div><button className={styles.linkButton} onClick={onViewRevenues}>Ver receitas <Icon name="arrow"/></button></div><div className={styles.list}>{entries.filter(e => e.entry_status !== 'adjustment').sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6).map(entry => <div className={styles.listRow} key={entry.id}><div><strong>{entry.description || (mode === 'monthly' ? 'Faturamento do mês' : 'Receita')}</strong><span>{formatDate(entry.date)}{entry.customer?.name ? ` · ${entry.customer.name}` : ''}</span></div><b className={entry.entry_status === 'cancelled' ? styles.strike : ''}>{money(entry.amount)}</b></div>)}{!entries.length && <div className={styles.emptyInline}>Nenhuma receita registrada neste mês.</div>}</div></section>
    <div className={styles.bottomAction}><button className={styles.secondaryButton} onClick={onClosing}>{locked ? 'Ver fechamento' : 'Concluir mês'}</button></div>
  </>;
}

function Metric({ label, value, detail }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Revenues({ mode, month, currentMonth, entries, categories, customers, paymentMethods, locked, search, setSearch, filters, setFilters, onAdd, onImport, onEdit, onDelete, onCancel, onAdjustment }) {
  const normalized = search.trim().toLowerCase();
  const historicalLocked = locked && month < currentMonth;
  const list = entries.filter(entry => {
    if (normalized && !`${entry.description || ''} ${entry.customer?.name || ''} ${entry.category?.name || ''}`.toLowerCase().includes(normalized)) return false;
    if (filters.category && entry.category_id !== filters.category) return false;
    if (filters.customer && entry.customer_id !== filters.customer) return false;
    if (filters.payment && entry.payment_method_id !== filters.payment) return false;
    return true;
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return <>
    <PageHeader title="Receitas" description={`Faturamento de ${monthName(month).toLowerCase()}.`}>{!locked && <><button className={styles.secondaryButtonSmall} onClick={onImport}><Icon name="download"/>Importar Excel/CSV</button><button className={styles.secondaryButtonSmall} onClick={onAdjustment}>Ajuste</button><button className={styles.primaryButtonSmall} onClick={onAdd}><Icon name="plus"/>Registrar</button></>}</PageHeader>
    {locked && <div className={styles.lockBar}><Icon name="lock"/><div><strong>Mês concluído</strong><span>{historicalLocked ? 'O histórico permanece bloqueado. Cancelamentos posteriores viram estorno no mês atual.' : 'Reabra o período antes de alterar lançamentos.'}</span></div></div>}
    <div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search"/><input placeholder="Buscar receita" value={search} onChange={e => setSearch(e.target.value)}/></label>{mode === 'individual' && <><select value={filters.customer} onChange={e => setFilters({ ...filters, customer: e.target.value })}><option value="">Todos os clientes</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">Todas as categorias</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={filters.payment} onChange={e => setFilters({ ...filters, payment: e.target.value })}><option value="">Todos os meios</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></>}</div>
    <section className={styles.panel}><div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Descrição</th>{mode === 'individual' && <><th>Cliente</th><th>Categoria</th><th>Pagamento</th></>}<th>Status</th><th>Valor</th><th/></tr></thead><tbody>{list.map(entry => <tr key={entry.id}><td>{formatDate(entry.date)}</td><td><strong>{entry.description || (entry.entry_status === 'adjustment' ? 'Ajuste de faturamento' : 'Receita')}</strong></td>{mode === 'individual' && <><td>{entry.customer?.name || 'Consumidor final'}</td><td>{entry.category?.name || '—'}</td><td>{entry.paymentMethod?.name || 'Não informado'}</td></>}<td><StatusPill entry={entry}/></td><td className={styles.moneyCell}>{entry.entry_status === 'adjustment' && entry.adjustment_kind === 'negative' ? '− ' : entry.entry_status === 'adjustment' && entry.adjustment_kind === 'positive' ? '+ ' : ''}{money(entry.amount)}</td><td><div className={styles.rowActions}>{entry.entry_status === 'active' && <>{!locked && <><button title="Editar" aria-label="Editar receita" onClick={() => onEdit(entry)}><Icon name="edit"/></button><button title="Excluir lançamento incorreto" aria-label="Excluir receita" onClick={() => { if (window.confirm('Excluir este lançamento? Use cancelar/estornar quando a venda realmente existiu.')) onDelete(entry); }}><Icon name="trash"/></button></>} {(!locked || historicalLocked) && <button title={historicalLocked ? 'Estornar no mês atual' : 'Cancelar ou estornar'} aria-label={historicalLocked ? 'Estornar receita no mês atual' : 'Cancelar receita'} onClick={() => onCancel(entry)}><Icon name="refresh"/></button>}</>}</div></td></tr>)}</tbody></table>{!list.length && <div className={styles.emptyInline}>Nenhum lançamento encontrado.</div>}</div></section>
  </>;
}

function StatusPill({ entry }) {
  const label = entry.entry_status === 'cancelled' ? 'Cancelada' : entry.entry_status === 'adjustment' ? (entry.adjustment_kind === 'negative' ? 'Estorno' : 'Ajuste +') : 'Ativa';
  return <span className={`${styles.statusPill} ${entry.entry_status === 'cancelled' || (entry.entry_status === 'adjustment' && entry.adjustment_kind === 'negative') ? styles.statusMuted : styles.statusGood}`}>{label}</span>;
}

function Customers({ customers, allEntries, search, setSearch, onCreate, onEdit, onToggle, onDelete, onOpen, onMerge }) {
  const q = search.trim().toLowerCase();
  const rows = customers.filter(c => !q || `${c.name} ${c.code} ${c.document || ''}`.toLowerCase().includes(q)).map(customer => {
    const linked = allEntries.filter(e => e.customer_id === customer.id);
    const active = linked.filter(e => e.entry_status === 'active');
    const total = grossBilling(active);
    const last = [...active].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return { customer, total, count: active.length, linkedCount: linked.length, ticket: active.length ? total / active.length : 0, last };
  }).sort((a, b) => b.total - a.total);
  return <><PageHeader title="Clientes" description="Cadastro financeiro leve, sem virar CRM."><button className={styles.secondaryButtonSmall} onClick={onMerge}>Mesclar</button><button className={styles.primaryButtonSmall} onClick={onCreate}><Icon name="plus"/>Novo cliente</button></PageHeader><div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search"/><input placeholder="Buscar por nome, código ou documento" value={search} onChange={e => setSearch(e.target.value)}/></label></div><div className={styles.customerGrid}>{rows.map(({ customer, total, count, linkedCount, ticket, last }) => <article className={`${styles.customerCard} ${!customer.active ? styles.customerInactive : ''}`} key={customer.id}><button className={styles.customerMain} onClick={() => onOpen(customer)}><div className={styles.customerAvatar}>{customer.is_consumer_final ? 'CF' : initials(customer.name)}</div><div><strong>{customer.name}</strong><span>{customer.code}{customer.external_code ? ` · ${customer.external_code}` : ''}</span></div></button><div className={styles.customerStats}><div><span>Faturado</span><b>{money(total)}</b></div><div><span>Receitas</span><b>{count}</b></div><div><span>Ticket médio</span><b>{money(ticket)}</b></div></div><div className={styles.customerFoot}><span>{last ? `Última: ${formatDate(last.date)}` : 'Sem receitas'}</span>{!customer.is_consumer_final && <div><button onClick={() => onEdit(customer)}>Editar</button>{linkedCount === 0 ? <button onClick={() => { if (window.confirm(`Excluir ${customer.name}? Esse cadastro ainda não possui receitas.`)) onDelete(customer); }}>Excluir</button> : <button onClick={() => onToggle(customer)}>{customer.active ? 'Inativar' : 'Reativar'}</button>}</div>}</div></article>)}</div></>;
}

function Reports({ mode, company, month, entries }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const months = [...new Set(entries.map(e => e.month))].sort();
  const monthly = months.map(key => ({ key, value: netBilling(entries.filter(e => e.month === key)) }));
  const current = entries.filter(e => e.month === month && e.entry_status === 'active');
  const group = (items, getKey) => [...items.reduce((map, item) => { const key = getKey(item) || 'Não informado'; map.set(key, (map.get(key) || 0) + Number(item.amount || 0)); return map; }, new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const categoriesData = group(current, e => e.category?.name);
  const customersData = group(current, e => e.customer?.name);
  const paymentData = group(current, e => e.paymentMethod?.name);
  const exportCsv = () => {
    const header = ['Data','Valor','Descrição','Cliente','Categoria','Meio de pagamento','Status'];
    const rows = entries.map(e => [formatDate(e.date), Number(e.amount || 0).toFixed(2).replace('.', ','), e.description || '', e.customer?.name || '', e.category?.name || '', e.paymentMethod?.name || '', e.entry_status]);
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `receitas-${company.name.replace(/\s+/g, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = entries.map(e => ({
      Data: formatDate(e.date),
      Competência: e.month,
      Valor: Number(e.amount || 0),
      Descrição: e.description || '',
      Cliente: e.customer?.name || '',
      Categoria: e.category?.name || '',
      'Meio de pagamento': e.paymentMethod?.name || '',
      Status: e.entry_status
    }));
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Receitas');
    XLSX.writeFile(workbook, `receitas-${company.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };
  const exportPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      await generateSimpleRevenuePdf({ company, month, mode, entries });
    } catch (error) {
      setPdfError(error?.message || 'Não foi possível gerar o PDF.');
    } finally {
      setPdfBusy(false);
    }
  };
  return <><PageHeader title="Relatórios" description="Análises proporcionais ao nível de detalhe que você registra."><button className={styles.primaryButtonSmall} disabled={pdfBusy} onClick={exportPdf}><Icon name="download"/>{pdfBusy ? 'Gerando PDF…' : 'PDF'}</button><button className={styles.secondaryButtonSmall} onClick={exportExcel}><Icon name="download"/>Excel</button><button className={styles.secondaryButtonSmall} onClick={exportCsv}><Icon name="download"/>CSV</button></PageHeader>{pdfError && <div className={styles.formError}>{pdfError}</div>}<div className={styles.reportGrid}><ReportCard title="Evolução mensal" rows={monthly.slice(-12).map(item => [monthName(item.key), item.value])}/>{mode === 'individual' && <><ReportCard title="Por cliente" rows={customersData.slice(0, 8)}/><ReportCard title="Por categoria" rows={categoriesData.slice(0, 8)}/><ReportCard title="Por meio de pagamento" rows={paymentData.slice(0, 8)}/></>}</div></>;
}

function ReportCard({ title, rows }) {
  const max = Math.max(1, ...rows.map(row => Number(row[1] || 0)));
  return <section className={styles.panel}><div className={styles.panelHead}><div><h3>{title}</h3><p>Faturamento conforme o nível de detalhe disponível.</p></div></div><div className={styles.reportRows}>{rows.length ? rows.map(([label, value]) => <div className={styles.reportRow} key={label}><div><span>{label}</span><b>{money(value)}</b></div><div className={styles.bar}><i style={{ width: `${Math.max(3, Number(value || 0) / max * 100)}%` }}/></div></div>) : <div className={styles.emptyInline}>Sem dados suficientes.</div>}</div></section>;
}

function Closing({ month, currentMonth, entries, submission, status, busy, onComplete, onReopen }) {
  const [noMovement, setNoMovement] = useState(Boolean(submission?.revenueNoMovement));
  useEffect(() => setNoMovement(Boolean(submission?.revenueNoMovement)), [submission?.revenueNoMovement, month]);
  const hasMovement = entries.some(e => e.entry_status === 'active' || e.entry_status === 'adjustment');
  const gross = grossBilling(entries); const negative = adjustments(entries, 'negative'); const positive = adjustments(entries, 'positive'); const net = netBilling(entries);
  const currentMonthWarning = month === currentMonth && noMovement;
  return <><PageHeader title="Fechamento do mês" description="Concluir significa que você terminou de informar e conferiu o período."/><div className={styles.closingGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>{monthName(month)}</h3><p>Status: {status}</p></div><span className={styles.bigStatus}>{submission?.revenueNoMovement && submission?.status === 'confirmed' ? 'Concluído · Sem movimento' : status}</span></div><div className={styles.summaryRows}><div><span>Faturamento bruto</span><b>{money(gross)}</b></div><div><span>Ajustes positivos</span><b>{money(positive)}</b></div><div><span>Estornos / ajustes negativos</span><b>{money(negative)}</b></div><div className={styles.summaryTotal}><span>Faturamento após ajustes</span><b>{money(net)}</b></div></div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Conferência</h3><p>O mês fica bloqueado depois da conclusão.</p></div></div><div className={styles.closingBody}>{submission?.status === 'confirmed' ? <><div className={styles.infoBox}><strong>Mês concluído</strong><span>{submission.revenueNoMovement ? 'Este período foi concluído como sem movimento.' : `Concluído em ${submission.confirmed_at ? new Date(submission.confirmed_at).toLocaleString('pt-BR') : 'data não informada'}.`}</span></div><button className={styles.secondaryButton} onClick={onReopen} disabled={busy}><Icon name="refresh"/>Reabrir mês</button></> : <><label className={`${styles.checkCard} ${hasMovement ? styles.checkDisabled : ''}`}><input type="checkbox" checked={noMovement} disabled={hasMovement} onChange={e => setNoMovement(e.target.checked)}/><div><strong>Sem movimento neste mês</strong><span>{hasMovement ? 'Remova os lançamentos antes de marcar sem movimento.' : 'Use quando o mês foi conferido e não houve faturamento.'}</span></div></label>{currentMonthWarning && <div className={styles.infoBox}><strong>O mês ainda está em andamento</strong><span>Você pode concluir como sem movimento, mas confirme se realmente não haverá mais faturamento neste período.</span></div>}{!hasMovement && !noMovement && <div className={styles.formError}>Registre uma receita ou marque o mês como sem movimento antes de concluir.</div>}<button className={styles.primaryButton} disabled={busy || (!hasMovement && !noMovement)} onClick={() => onComplete(noMovement)}><Icon name="check"/>{busy ? 'Concluindo…' : 'Concluir mês'}</button></>}</div></section></div>{submission?.status === 'reopened' && <div className={styles.historyNote}><strong>Este mês foi reaberto.</strong><span>Motivo: {submission.reopen_reason || 'Não informado'} · Reaberturas: {submission.reopenCount || 1}</span></div>}</>;
}

function Settings({ company, categories, paymentMethods, currentMonth, onScheduleMode, onAddCategory, onEditCategory, onToggleCategory, onAddPayment, onEditPayment, onTogglePayment }) {
  const [mode, setMode] = useState(company.pendingRevenueMode || company.revenueMode);
  useEffect(() => setMode(company.pendingRevenueMode || company.revenueMode), [company.pendingRevenueMode, company.revenueMode]);
  return <><PageHeader title="Configurações" description="Ajuste como o Controle Simples organiza seu faturamento."/><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Modo de lançamento</h3><p>A mudança vale a partir do próximo mês e não reinterpreta o histórico.</p></div></div><div className={styles.settingsBody}><select value={mode} onChange={e => setMode(e.target.value)}>{SIMPLE_MODES.map(item => <option key={item} value={item}>{modeName(item)}</option>)}</select><button className={styles.secondaryButton} disabled={mode === (company.pendingRevenueMode || company.revenueMode)} onClick={() => onScheduleMode(mode)}>Programar mudança</button>{company.pendingRevenueMode && <div className={styles.infoBox}><strong>Mudança programada</strong><span>{modeName(company.pendingRevenueMode)} a partir de {monthName(company.pendingRevenueModeEffective)}. Até {monthName(currentMonth)}, o modo atual continua sendo {modeName(company.revenueMode)}.</span></div>}</div></section><CatalogPanel title="Categorias" items={categories} onAdd={onAddCategory} onEdit={onEditCategory} onToggle={onToggleCategory}/><CatalogPanel title="Meios de pagamento" items={paymentMethods} onAdd={onAddPayment} onEdit={onEditPayment} onToggle={onTogglePayment}/></div></>;
}

function CatalogPanel({ title, items, onAdd, onEdit, onToggle }) {
  return <section className={styles.panel}><div className={styles.panelHead}><div><h3>{title}</h3><p>Itens usados no modo Cada receita.</p></div><button className={styles.iconButton} onClick={onAdd} aria-label={`Adicionar em ${title}`}><Icon name="plus"/></button></div><div className={styles.catalogList}>{items.map(item => <div key={item.id}><div><strong>{item.name}</strong><span>{item.is_default ? 'Padrão' : 'Personalizada'} · {item.active ? 'Ativa' : 'Inativa'}</span></div><div><button onClick={() => onEdit(item)}>Editar</button><button onClick={() => onToggle(item)}>{item.active ? 'Inativar' : 'Reativar'}</button></div></div>)}</div></section>;
}

function RevenueForm({ mode, entry, draft, categories, customers, paymentMethods, busy, onQuickCustomer, onSubmit }) {
  const base = draft || {};
  const [form, setForm] = useState({
    date: base.date || (entry?.date ? String(entry.date).slice(0, 10) : today()),
    amount: base.amount ?? entry?.amount ?? '',
    description: base.description ?? entry?.description ?? '',
    categoryId: base.categoryId ?? entry?.category_id ?? '',
    customerId: base.customerId ?? entry?.customer_id ?? customers.find(c => c.is_consumer_final)?.id ?? '',
    paymentMethodId: base.paymentMethodId ?? entry?.payment_method_id ?? ''
  });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
    {mode !== 'monthly' && <label>Data da venda ou serviço<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required/></label>}
    <label>Valor bruto<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required/></label>
    <label className={styles.fullField}>{mode === 'monthly' ? 'Observação' : mode === 'daily' ? 'Observação do dia' : 'Descrição'}<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder={mode === 'individual' ? 'Ex.: Consultoria tributária' : 'Opcional'}/></label>
    {mode === 'individual' && <><label>Categoria<select value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}><option value="">Sem categoria</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Cliente<div className={styles.inlineField}><select value={form.customerId} onChange={e => setForm({ ...form, customerId: e.target.value })}>{customers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => onQuickCustomer(form)} aria-label="Cadastrar cliente sem sair do lançamento">+</button></div></label><label>Meio de pagamento<select value={form.paymentMethodId} onChange={e => setForm({ ...form, paymentMethodId: e.target.value })}><option value="">Não informado</option>{paymentMethods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
    <div className={styles.formFooter}><button className={styles.primaryButton} disabled={busy}>{busy ? 'Salvando…' : entry ? 'Salvar alterações' : 'Registrar receita'}</button></div>
  </form>;
}

function CustomerForm({ customer, busy, onSubmit }) {
  const [form, setForm] = useState({ name: customer?.name || '', document: customer?.document || '', phone: customer?.phone || '', email: customer?.email || '', notes: customer?.notes || '', externalCode: customer?.external_code || '' });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(form); }}><label className={styles.fullField}>Nome<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required/></label><label>CPF/CNPJ<input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })}/></label><label>Código externo<input value={form.externalCode} onChange={e => setForm({ ...form, externalCode: e.target.value })} placeholder="Opcional"/></label><label>Telefone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label><label>E-mail<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label><label className={styles.fullField}>Observação<textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label><div className={styles.formFooter}><button className={styles.primaryButton} disabled={busy}>{busy ? 'Salvando…' : customer ? 'Salvar cliente' : 'Cadastrar cliente'}</button></div></form>;
}

function CustomerDetail({ customer, entries }) {
  const active = entries.filter(e => e.entry_status === 'active'); const total = grossBilling(active);
  const last = [...active].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return <div className={styles.detail}><div className={styles.detailHero}><div className={styles.customerAvatar}>{customer.is_consumer_final ? 'CF' : initials(customer.name)}</div><div><h3>{customer.name}</h3><p>{customer.code}{customer.external_code ? ` · ${customer.external_code}` : ''}</p></div></div><div className={styles.detailStats}><Metric label="Faturado" value={money(total)} detail="Receitas ativas"/><Metric label="Receitas" value={active.length} detail={`Ticket médio ${money(active.length ? total / active.length : 0)}`}/><Metric label="Última receita" value={last ? formatDate(last.date) : '—'} detail={last ? money(last.amount) : 'Sem histórico'}/></div><h4>Histórico</h4><div className={styles.list}>{[...entries].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(entry => <div className={styles.listRow} key={entry.id}><div><strong>{entry.description || 'Receita'}</strong><span>{formatDate(entry.date)} · {entry.category?.name || 'Sem categoria'} · {entry.paymentMethod?.name || 'Não informado'} · {entry.entry_status === 'cancelled' ? 'Cancelada' : 'Ativa'}</span></div><b className={entry.entry_status === 'cancelled' ? styles.strike : ''}>{money(entry.amount)}</b></div>)}{!entries.length && <div className={styles.emptyInline}>Ainda não há receitas vinculadas.</div>}</div></div>;
}

function MergeCustomerForm({ customers, busy, onSubmit }) {
  const [sourceId, setSourceId] = useState(''); const [targetId, setTargetId] = useState('');
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); if (sourceId === targetId) return; if (window.confirm('Todas as receitas do cadastro duplicado serão transferidas para o cadastro principal. Continuar?')) onSubmit({ sourceId, targetId }); }}><label>Cadastro duplicado<select value={sourceId} onChange={e => setSourceId(e.target.value)} required><option value="">Selecione</option>{customers.map(c => <option value={c.id} key={c.id}>{c.name} · {c.code}</option>)}</select></label><label>Manter como principal<select value={targetId} onChange={e => setTargetId(e.target.value)} required><option value="">Selecione</option>{customers.map(c => <option value={c.id} key={c.id}>{c.name} · {c.code}</option>)}</select></label><div className={styles.infoBox}><strong>O histórico não é apagado</strong><span>O cadastro duplicado será marcado como mesclado e suas receitas passarão ao cadastro principal.</span></div><div className={styles.formFooter}><button className={styles.primaryButton} disabled={busy || !sourceId || !targetId || sourceId === targetId}>Mesclar clientes</button></div></form>;
}

function NameForm({ label, initial = '', busy, onSubmit }) {
  const [name, setName] = useState(initial);
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(name); }}><label className={styles.fullField}>{label}<input value={name} onChange={e => setName(e.target.value)} autoFocus required/></label><div className={styles.formFooter}><button className={styles.primaryButton} disabled={busy || !name.trim()}>Salvar</button></div></form>;
}

function AdjustmentForm({ month, busy, onSubmit }) {
  const [form, setForm] = useState({ date: today(), amount: '', direction: 'negative', description: '' });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(form); }}><label>Tipo<select value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="negative">Estorno / ajuste negativo</option><option value="positive">Ajuste positivo</option></select></label><label>Data<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required/></label><label>Valor<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required/></label><label className={styles.fullField}>Motivo / descrição<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required/></label><div className={styles.infoBox}><strong>{monthName(month)}</strong><span>O ajuste aparece separado do faturamento bruto e compõe o faturamento após ajustes.</span></div><div className={styles.formFooter}><button className={styles.primaryButton} disabled={busy}>Registrar ajuste</button></div></form>;
}

function CancelForm({ entry, locked, month, currentMonth, busy, onSubmit }) {
  const [reason, setReason] = useState('');
  const historical = locked && month < currentMonth;
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(reason); }}><div className={styles.infoBox}><strong>{historical ? 'Será criado um estorno no mês atual' : 'Cancelar não é o mesmo que excluir'}</strong><span>{historical ? `${monthName(month)} permanecerá exatamente como foi concluído. O ajuste negativo será registrado em ${monthName(currentMonth)} e ficará ligado à receita original.` : 'Use esta opção quando a venda existiu de verdade e depois foi cancelada.'}</span></div><label className={styles.fullField}>Motivo<input value={reason} onChange={e => setReason(e.target.value)} required placeholder="Ex.: cliente cancelou o serviço"/></label><div className={styles.formFooter}><button className={styles.dangerButton} disabled={busy || !reason.trim()}>{historical ? `Estornar ${money(entry.amount)}` : 'Cancelar receita'}</button></div></form>;
}

function ReopenForm({ month, busy, onSubmit }) {
  const [reason, setReason] = useState('');
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(reason); }}><div className={styles.infoBox}><strong>Reabrir {monthName(month)}</strong><span>O período voltará a aceitar inclusões, edições e exclusões. A reabertura ficará registrada no histórico e o contador será avisado dentro da Central.</span></div><label className={styles.fullField}>Motivo da reabertura<input value={reason} onChange={e => setReason(e.target.value)} required placeholder="Ex.: esqueci de lançar uma receita"/></label><div className={styles.formFooter}><button className={styles.primaryButton} disabled={busy || !reason.trim()}>Reabrir mês</button></div></form>;
}

function Modal({ title, wide = false, onClose, children }) {
  return <div className={styles.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`${styles.modal} ${wide ? styles.modalWide : ''}`}><div className={styles.modalHead}><div><span className={styles.eyebrow}>Controle Simples</span><h2>{title}</h2></div><button onClick={onClose}>×</button></div><div className={styles.modalBody}>{children}</div></div></div>;
}

function modalTitle(type) {
  return ({ revenue: 'Registrar receita', import: 'Importar receitas', customer: 'Cliente', customerDetail: 'Detalhes do cliente', mergeCustomer: 'Mesclar clientes', category: 'Categoria', payment: 'Meio de pagamento', adjustment: 'Ajuste de faturamento', cancel: 'Cancelar / estornar receita', reopen: 'Reabrir mês' })[type] || 'Central Financeira';
}

function NotificationStrip({ notifications, onRead }) {
  if (!notifications.length) return null;
  return <div className={styles.notifications}>{notifications.map(item => <button key={item.id} onClick={() => onRead(item.id)}><Icon name="bell"/><div><strong>{item.title}</strong><span>{item.message}</span></div><small>Marcar como lida</small></button>)}</div>;
}

function MobileNav({ view, individual, onNavigate }) {
  const items = individual
    ? [['overview','home','Início'],['revenues','money','Receitas'],['customers','users','Clientes'],['reports','chart','Relatórios'],['more','more','Mais']]
    : [['overview','home','Início'],['revenues','money','Receitas'],['reports','chart','Relatórios'],['closing','check','Fechar'],['more','more','Mais']];
  const [moreOpen, setMoreOpen] = useState(false);
  return <><div className={styles.mobileNav}>{items.map(([id, icon, label]) => <button key={id} className={view === id ? styles.mobileActive : ''} onClick={() => { if (id === 'more') setMoreOpen(true); else onNavigate(id); }}><Icon name={icon}/><span>{label}</span></button>)}</div>{moreOpen && <div className={styles.mobileMoreBackdrop} onClick={() => setMoreOpen(false)}><div className={styles.mobileMore} onClick={e => e.stopPropagation()}><button onClick={() => { onNavigate('closing'); setMoreOpen(false); }}><Icon name="check"/>Fechamento do mês</button><button onClick={() => { onNavigate('settings'); setMoreOpen(false); }}><Icon name="settings"/>Configurações</button></div></div>}</>;
}
