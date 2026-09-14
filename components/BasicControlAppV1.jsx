'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import {
  SIMPLE_MODES,
  cancelSimpleRevenue,
  deleteSimpleRevenue,
  deleteUnusedSimpleCustomer,
  importSimpleRevenueRows,
  mergeSimpleCustomers,
  saveRevenueAdjustment,
  saveSimpleCategory,
  saveSimpleCustomer,
  saveSimplePaymentMethod,
  saveSimpleRevenue,
  setSimpleCategoryActive,
  setSimpleCustomerActive,
  setSimplePaymentMethodActive
} from '../lib/neon-simple-control';
import {
  BASIC_EXPENSE_MODES,
  bootstrapBasicOrganization,
  bulkDeleteBasicExpenses,
  bulkUpdateBasicExpenses,
  cancelBasicExpense,
  completeBasicMonth,
  deleteBasicExpense,
  deleteUnusedBasicSupplier,
  importBasicExpenseRows,
  loadBasicControlData,
  markBasicNotificationRead,
  mergeBasicSuppliers,
  monthKey,
  nextMonth,
  normalizeBasicError,
  previousMonth,
  reopenBasicMonth,
  saveBasicExpense,
  saveBasicExpenseCategory,
  saveBasicPaymentMethod,
  saveBasicSupplier,
  saveExpenseAdjustment,
  scheduleBasicRevenueMode,
  scheduleControlTier,
  scheduleExpenseMode,
  setBasicExpenseCategoryActive,
  setBasicPaymentMethodActive,
  setBasicSupplierActive,
  updateBasicSettings
} from '../lib/neon-basic-control';
import SimpleRevenueImport from './SimpleRevenueImport';
import BasicExpenseImport from './BasicExpenseImport';
import { generateBasicControlPdf } from '../lib/basic-report-pdf';
import styles from './SimpleControlApp.module.css';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const today = () => new Date().toISOString().slice(0, 10);
const monthName = key => {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || 'Período';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)).replace(/^./, c => c.toUpperCase());
};
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const initials = value => String(value || 'LG').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const revenueModeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada receita' })[mode] || mode;
const expenseModeName = mode => ({ monthly: 'Total do mês', individual: 'Cada despesa' })[mode] || mode;
const activeTotal = entries => entries.filter(e => e.entry_status === 'active').reduce((sum, e) => sum + Number(e.amount || 0), 0);
const adjustmentTotal = (entries, kind) => entries.filter(e => e.entry_status === 'adjustment' && e.adjustment_kind === kind).reduce((sum, e) => sum + Number(e.amount || 0), 0);
const netTotal = entries => activeTotal(entries) + adjustmentTotal(entries, 'positive') - adjustmentTotal(entries, 'negative');
const byType = (entries, type) => entries.filter(entry => entry.type === type);
const dayOf = value => Number(String(value || '').slice(8, 10) || 0);

function Icon({ name }) {
  const paths = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/></>,
    expense: <><path d="M4 7h16M5 7l1 14h12l1-14M9 3h6l1 4H8Z"/><path d="M9 11h6M9 15h4"/></>,
    users: <><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><path d="M18 8a3 3 0 0 1 0 6M22 21v-2a4 4 0 0 0-3-3.87"/></>,
    truck: <><path d="M3 5h11v12H3zM14 9h4l3 3v5h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6l-2 2M5.5 15A7 7 0 0 0 18 18l2-2"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>
  };
  return <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.money}</svg>;
}

function periodRevenueMode({ company, month, entries, submission }) {
  const snapshot = submission?.settings_snapshot?.revenueMode;
  if (SIMPLE_MODES.includes(snapshot)) return snapshot;
  const entryMode = entries.find(entry => entry.type === 'revenue' && entry.entry_status !== 'adjustment' && SIMPLE_MODES.includes(entry.mode))?.mode;
  if (entryMode) return entryMode;
  if (company.pendingRevenueMode && company.pendingRevenueModeEffective && month >= company.pendingRevenueModeEffective) return company.pendingRevenueMode;
  return company.revenueMode;
}

function periodExpenseMode({ company, month, entries, submission }) {
  const snapshot = submission?.settings_snapshot?.expenseMode;
  if (BASIC_EXPENSE_MODES.includes(snapshot)) return snapshot;
  const entryMode = entries.find(entry => entry.type === 'expense' && entry.entry_status !== 'adjustment' && BASIC_EXPENSE_MODES.includes(entry.mode))?.mode;
  if (entryMode) return entryMode;
  if (company.pendingExpenseMode && company.pendingExpenseModeEffective && month >= company.pendingExpenseModeEffective) return company.pendingExpenseMode;
  return company.expenseMode;
}

export default function BasicControlAppV1() {
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
  const [filters, setFilters] = useState({ category: '', customer: '', supplier: '', payment: '', min: '', max: '', sort: 'date_desc' });
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
      const data = await loadBasicControlData(activeOrganizationId);
      if (data.reload) { window.location.reload(); return; }
      setState(data);
      setSelectedCompanyId(current => current && data.companies.some(c => c.id === current) ? current : (data.companies[0]?.id || null));
    } catch (e) {
      setError(normalizeBasicError(e));
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
        await bootstrapBasicOrganization(company.id);
        if (!cancelled) {
          setBootstrapped(prev => ({ ...prev, [company.id]: true }));
          await refresh();
        }
      } catch (e) {
        if (!cancelled) setError(normalizeBasicError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  useEffect(() => {
    if (!company || !state?.currentMonth) return;
    const tasks = {};
    if (company.pendingRevenueMode && company.pendingRevenueModeEffective <= state.currentMonth) {
      tasks.revenueMode = company.pendingRevenueMode;
      tasks.pendingRevenueMode = null;
      tasks.pendingRevenueModeEffective = null;
    }
    if (company.pendingExpenseMode && company.pendingExpenseModeEffective <= state.currentMonth) {
      tasks.expenseMode = company.pendingExpenseMode;
      tasks.pendingExpenseMode = null;
      tasks.pendingExpenseModeEffective = null;
    }
    if (company.pendingControlTier && company.pendingControlTierEffective <= state.currentMonth) {
      tasks.controlTier = company.pendingControlTier;
      tasks.expenseEnabled = company.pendingControlTier === 'basic';
      tasks.pendingControlTier = null;
      tasks.pendingControlTierEffective = null;
    }
    if (!Object.keys(tasks).length) return;
    let cancelled = false;
    (async () => {
      try {
        await updateBasicSettings(company.id, tasks);
        if (!cancelled) {
          if (tasks.controlTier === 'simple') window.location.reload();
          else await refresh();
        }
      } catch (e) {
        if (!cancelled) setError(normalizeBasicError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id, company?.pendingRevenueMode, company?.pendingExpenseMode, company?.pendingControlTier, state?.currentMonth]);

  const run = async (action, success) => {
    setBusy(true); setError('');
    try {
      const result = await action();
      await refresh();
      if (success) setToast(success);
      return result === undefined ? true : result;
    } catch (e) {
      const message = normalizeBasicError(e);
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
      setError(normalizeBasicError(e)); setAuthBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); window.location.reload(); }
    catch (e) { setError(normalizeBasicError(e)); setBusy(false); }
  }

  if (session.isPending) return <Center text="Carregando Central Financeira…"/>;
  if (!user) return <Login onSubmit={signIn} busy={authBusy} error={error}/>;
  if (!state) return <Center text="Organizando receitas e despesas…"/>;
  if (!company) return <div className={styles.center}><div className={styles.emptyCard}><h2>Nenhuma empresa disponível</h2><p>Este acesso ainda não está vinculado a uma empresa.</p><button className={styles.secondaryButton} onClick={signOut}>Sair</button></div></div>;

  const categoriesRevenue = state.categories.filter(row => row.organization_id === company.id && row.type === 'revenue');
  const categoriesExpense = state.categories.filter(row => row.organization_id === company.id && row.type === 'expense');
  const customers = state.customers.filter(row => row.organization_id === company.id && !row.merged_into);
  const suppliers = state.suppliers.filter(row => row.organization_id === company.id && !row.merged_into);
  const paymentMethods = state.paymentMethods.filter(row => row.organization_id === company.id);
  const allCompanyEntries = state.entries.filter(entry => entry.companyId === company.id);
  const currentEntries = allCompanyEntries.filter(entry => entry.month === month);
  const currentSubmission = state.submissions.find(item => item.companyId === company.id && item.month === month) || null;
  const revenueMode = periodRevenueMode({ company, month, entries: currentEntries, submission: currentSubmission });
  const expenseMode = periodExpenseMode({ company, month, entries: currentEntries, submission: currentSubmission });
  const locked = currentSubmission?.status === 'confirmed';
  const status = locked ? 'Concluído' : currentSubmission?.status === 'reopened' ? 'Reaberto' : 'Em andamento';
  const previousKey = previousMonth(month);
  const previousEntries = allCompanyEntries.filter(entry => entry.month === previousKey);
  const startMonth = company.controlStartMonth || month;
  const revenueEntries = byType(currentEntries, 'revenue');
  const expenseEntries = byType(currentEntries, 'expense');
  const navigate = target => { setView(target); setSearch(''); setFilters({ category: '', customer: '', supplier: '', payment: '', min: '', max: '', sort: 'date_desc' }); };

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><div className={styles.brandMark}>LG</div><div><strong>Central Financeira</strong><span>Controle Básico</span></div></div>
      {state.systemRole === 'super_admin' && <div className={styles.companyPicker}><label>Empresa em teste</label><select value={company.id} onChange={e => { setSelectedCompanyId(e.target.value); setView('overview'); }}>
        {state.companies.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></div>}
      <nav className={styles.nav}>
        <NavButton active={view === 'overview'} icon="home" label="Início" onClick={() => navigate('overview')}/>
        <NavButton active={view === 'revenues'} icon="money" label="Receitas" onClick={() => navigate('revenues')}/>
        <NavButton active={view === 'expenses'} icon="expense" label="Despesas" onClick={() => navigate('expenses')}/>
        {revenueMode === 'individual' && <NavButton active={view === 'customers'} icon="users" label="Clientes" onClick={() => navigate('customers')}/>} 
        {expenseMode === 'individual' && <NavButton active={view === 'suppliers'} icon="truck" label="Fornecedores" onClick={() => navigate('suppliers')}/>} 
        <NavButton active={view === 'reports'} icon="chart" label="Relatórios" onClick={() => navigate('reports')}/>
        <NavButton active={view === 'closing'} icon="check" label="Fechamento do mês" onClick={() => navigate('closing')}/>
        <NavButton active={view === 'settings'} icon="settings" label="Configurações" onClick={() => navigate('settings')}/>
      </nav>
      <div className={styles.sidebarFooter}><button onClick={signOut}><Icon name="logout"/>Sair</button></div>
    </aside>

    <main className={styles.main}>
      <header className={styles.topbar}><div><strong>{company.name}</strong><span>{company.document || 'Documento não informado'} · Controle Básico</span></div><div className={styles.topActions}><MonthPicker value={month} startMonth={startMonth} onChange={setMonth}/><div className={styles.avatar}>{initials(user.name || user.email)}</div></div></header>
      <div className={styles.content}>
        {error && <div className={styles.errorBanner}>{error}</div>}
        {state.systemRole === 'super_admin' && state.notifications.filter(n => !n.read_at).slice(0, 3).map(n => <div className={styles.notifications} key={n.id}><button onClick={() => run(() => markBasicNotificationRead(n.id))}><div><strong>{n.title}</strong><span>{n.message}</span></div><small>Marcar como lida</small></button></div>)}

        {view === 'overview' && <Overview month={month} revenueMode={revenueMode} expenseMode={expenseMode} entries={currentEntries} previousEntries={previousEntries} status={status} locked={locked} onRevenue={() => navigate('revenues')} onExpense={() => navigate('expenses')} onClosing={() => navigate('closing')}/>} 
        {view === 'revenues' && <RevenuePage mode={revenueMode} month={month} currentMonth={state.currentMonth} entries={revenueEntries} categories={categoriesRevenue} customers={customers} paymentMethods={paymentMethods} locked={locked} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters}
          onAdd={() => setModal({ type: 'revenue' })}
          onImport={() => setModal({ type: 'revenueImport' })}
          onEdit={entry => setModal({ type: 'revenue', entry })}
          onDelete={entry => run(() => deleteSimpleRevenue(entry.id), 'Receita excluída.')}
          onCancel={entry => setModal({ type: 'revenueCancel', entry })}
          onAdjustment={() => setModal({ type: 'revenueAdjustment' })}/>} 
        {view === 'expenses' && <ExpensePage mode={expenseMode} month={month} currentMonth={state.currentMonth} entries={expenseEntries} categories={categoriesExpense} suppliers={suppliers} paymentMethods={paymentMethods} locked={locked} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters}
          onAdd={() => setModal({ type: 'expense' })}
          onImport={() => setModal({ type: 'expenseImport' })}
          onEdit={entry => setModal({ type: 'expense', entry })}
          onDelete={entry => run(() => deleteBasicExpense(entry.id), 'Despesa excluída.')}
          onCancel={entry => setModal({ type: 'expenseCancel', entry })}
          onAdjustment={() => setModal({ type: 'expenseAdjustment' })}
          onBulk={selected => setModal({ type: 'expenseBulk', selected })}/>} 
        {view === 'customers' && <PartyPage title="Clientes" kind="customer" parties={customers} entries={allCompanyEntries.filter(e => e.type === 'revenue')} onCreate={() => setModal({ type: 'customer' })} onEdit={party => setModal({ type: 'customer', party })} onToggle={party => run(() => setSimpleCustomerActive(party.id, !party.active), party.active ? 'Cliente inativado.' : 'Cliente reativado.')} onDelete={party => run(() => deleteUnusedSimpleCustomer(party.id), 'Cliente excluído.')} onMerge={() => setModal({ type: 'customerMerge' })}/>} 
        {view === 'suppliers' && <PartyPage title="Fornecedores" kind="supplier" parties={suppliers} entries={allCompanyEntries.filter(e => e.type === 'expense')} onCreate={() => setModal({ type: 'supplier' })} onEdit={party => setModal({ type: 'supplier', party })} onToggle={party => run(() => setBasicSupplierActive(party.id, !party.active), party.active ? 'Fornecedor inativado.' : 'Fornecedor reativado.')} onDelete={party => run(() => deleteUnusedBasicSupplier(party.id), 'Fornecedor excluído.')} onMerge={() => setModal({ type: 'supplierMerge' })}/>} 
        {view === 'reports' && <Reports company={company} month={month} revenueMode={revenueMode} expenseMode={expenseMode} entries={allCompanyEntries}/>} 
        {view === 'closing' && <Closing month={month} currentMonth={state.currentMonth} revenueEntries={revenueEntries} expenseEntries={expenseEntries} submission={currentSubmission} status={status} locked={locked} busy={busy} onComplete={async values => {
          const result = await run(() => completeBasicMonth({ organizationId: company.id, month, revenueMode, expenseMode, ...values }), 'Mês concluído.');
          if (result) setView('overview');
        }} onReopen={() => setModal({ type: 'reopen' })}/>} 
        {view === 'settings' && <Settings company={company} currentMonth={state.currentMonth} revenueCategories={categoriesRevenue} expenseCategories={categoriesExpense} paymentMethods={paymentMethods}
          onRevenueMode={mode => run(() => scheduleBasicRevenueMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança de receitas programada para ${monthName(nextMonth(state.currentMonth))}.`)}
          onExpenseMode={mode => run(() => scheduleExpenseMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança de despesas programada para ${monthName(nextMonth(state.currentMonth))}.`)}
          onTier={tier => run(() => scheduleControlTier(company.id, tier, nextMonth(state.currentMonth)), `Mudança de nível programada para ${monthName(nextMonth(state.currentMonth))}.`)}
          onRevenueCategory={(item = null) => setModal({ type: 'revenueCategory', item })}
          onExpenseCategory={(item = null) => setModal({ type: 'expenseCategory', item })}
          onToggleRevenueCategory={item => run(() => setSimpleCategoryActive(item.id, !item.active), item.active ? 'Categoria inativada.' : 'Categoria reativada.')}
          onToggleExpenseCategory={item => run(() => setBasicExpenseCategoryActive(item.id, !item.active), item.active ? 'Categoria inativada.' : 'Categoria reativada.')}
          onPayment={(item = null) => setModal({ type: 'payment', item })}
          onTogglePayment={item => run(() => setBasicPaymentMethodActive(item.id, !item.active), item.active ? 'Meio inativado.' : 'Meio reativado.')}/>} 
      </div>
    </main>

    {modal && <Modal title={modalTitle(modal.type)} onClose={() => !busy && setModal(null)}>
      {modal.type === 'revenue' && <RevenueForm mode={revenueMode} entry={modal.entry} categories={categoriesRevenue.filter(c => c.active)} customers={customers.filter(c => c.active)} paymentMethods={paymentMethods.filter(p => p.active)} busy={busy} onQuickCustomer={() => setModal({ type: 'customer', returnTo: 'revenue' })} onSubmit={async values => { const result = await run(() => saveSimpleRevenue({ organizationId: company.id, month, mode: revenueMode, existingId: modal.entry?.id, ...values }), modal.entry ? 'Receita atualizada.' : 'Receita registrada.'); if (result) setModal(null); }}/>} 
      {modal.type === 'expense' && <ExpenseForm mode={expenseMode} entry={modal.entry} categories={categoriesExpense.filter(c => c.active)} suppliers={suppliers.filter(s => s.active)} paymentMethods={paymentMethods.filter(p => p.active)} busy={busy} onQuickSupplier={() => setModal({ type: 'supplier', returnTo: 'expense' })} onSubmit={async values => { const result = await run(() => saveBasicExpense({ organizationId: company.id, month, mode: expenseMode, existingId: modal.entry?.id, ...values }), modal.entry ? 'Despesa atualizada.' : 'Despesa registrada.'); if (result) setModal(null); }}/>} 
      {modal.type === 'revenueImport' && <SimpleRevenueImport mode={revenueMode} month={month} existingEntries={revenueEntries} categories={categoriesRevenue} customers={customers} paymentMethods={paymentMethods} busy={busy} onConfirm={async rows => { const result = await run(() => importSimpleRevenueRows({ organizationId: company.id, month, mode: revenueMode, rows }), `${rows.length} ${rows.length === 1 ? 'receita importada' : 'receitas importadas'}.`); if (result) setModal(null); }}/>} 
      {modal.type === 'expenseImport' && <BasicExpenseImport mode={expenseMode} month={month} existingEntries={expenseEntries} categories={categoriesExpense} suppliers={suppliers} paymentMethods={paymentMethods} busy={busy} onConfirm={async rows => { const result = await run(() => importBasicExpenseRows({ organizationId: company.id, month, mode: expenseMode, rows }), `${rows.length} ${rows.length === 1 ? 'despesa importada' : 'despesas importadas'}.`); if (result) setModal(null); }}/>} 
      {modal.type === 'customer' && <PartyForm kind="customer" party={modal.party} busy={busy} onSubmit={async values => { const result = await run(() => saveSimpleCustomer({ organizationId: company.id, existingId: modal.party?.id, ...values }), modal.party ? 'Cliente atualizado.' : 'Cliente criado.'); if (result) setModal(null); }}/>} 
      {modal.type === 'supplier' && <PartyForm kind="supplier" party={modal.party} busy={busy} onSubmit={async values => { const result = await run(() => saveBasicSupplier({ organizationId: company.id, existingId: modal.party?.id, ...values }), modal.party ? 'Fornecedor atualizado.' : 'Fornecedor criado.'); if (result) setModal(null); }}/>} 
      {modal.type === 'customerMerge' && <MergeForm kind="cliente" parties={customers.filter(p => !p.is_consumer_final && p.active)} busy={busy} onSubmit={async values => { const result = await run(() => mergeSimpleCustomers({ organizationId: company.id, ...values }), 'Clientes mesclados.'); if (result) setModal(null); }}/>} 
      {modal.type === 'supplierMerge' && <MergeForm kind="fornecedor" parties={suppliers.filter(p => !p.is_unspecified && p.active)} busy={busy} onSubmit={async values => { const result = await run(() => mergeBasicSuppliers({ organizationId: company.id, ...values }), 'Fornecedores mesclados.'); if (result) setModal(null); }}/>} 
      {(modal.type === 'revenueCategory' || modal.type === 'expenseCategory' || modal.type === 'payment') && <CatalogForm type={modal.type} item={modal.item} busy={busy} onSubmit={async name => { const action = modal.type === 'revenueCategory' ? () => saveSimpleCategory({ organizationId: company.id, existingId: modal.item?.id, name }) : modal.type === 'expenseCategory' ? () => saveBasicExpenseCategory({ organizationId: company.id, existingId: modal.item?.id, name }) : () => saveBasicPaymentMethod({ organizationId: company.id, existingId: modal.item?.id, name }); const result = await run(action, modal.item ? 'Cadastro atualizado.' : 'Cadastro criado.'); if (result) setModal(null); }}/>} 
      {(modal.type === 'revenueAdjustment' || modal.type === 'expenseAdjustment') && <AdjustmentForm kind={modal.type === 'revenueAdjustment' ? 'revenue' : 'expense'} busy={busy} onSubmit={async values => { const action = modal.type === 'revenueAdjustment' ? () => saveRevenueAdjustment({ organizationId: company.id, month, ...values }) : () => saveExpenseAdjustment({ organizationId: company.id, month, ...values }); const result = await run(action, 'Ajuste registrado.'); if (result) setModal(null); }}/>} 
      {(modal.type === 'revenueCancel' || modal.type === 'expenseCancel') && <CancelForm label={modal.type === 'revenueCancel' ? 'receita' : 'despesa'} busy={busy} onSubmit={async reason => {
        const entry = modal.entry;
        const isRevenue = modal.type === 'revenueCancel';
        if (locked && month === state.currentMonth) { setError('Reabra o mês atual antes de alterar este lançamento.'); setModal(null); return; }
        const historical = locked && month < state.currentMonth;
        const action = historical
          ? () => isRevenue
            ? saveRevenueAdjustment({ organizationId: company.id, month: state.currentMonth, date: today(), amount: entry.amount, direction: 'negative', description: `Estorno de ${monthName(month)}: ${entry.description || 'receita'}. ${reason}`, sourceEntryId: entry.id })
            : saveExpenseAdjustment({ organizationId: company.id, month: state.currentMonth, date: today(), amount: entry.amount, direction: 'negative', description: `Reembolso/estorno de ${monthName(month)}: ${entry.description || 'despesa'}. ${reason}`, sourceEntryId: entry.id })
          : () => isRevenue ? cancelSimpleRevenue({ entryId: entry.id, reason }) : cancelBasicExpense({ entryId: entry.id, reason });
        const result = await run(action, historical ? 'Ajuste registrado no mês atual.' : 'Lançamento cancelado.');
        if (result) setModal(null);
      }}/>} 
      {modal.type === 'expenseBulk' && <BulkExpenseForm selected={modal.selected} categories={categoriesExpense.filter(c => c.active)} suppliers={suppliers.filter(s => s.active)} paymentMethods={paymentMethods.filter(p => p.active)} busy={busy} onSubmit={async action => {
        if (action.kind === 'delete') {
          if (!window.confirm(`Excluir ${modal.selected.length} despesas selecionadas? Use estorno quando o gasto realmente existiu.`)) return;
          const result = await run(() => bulkDeleteBasicExpenses({ organizationId: company.id, ids: modal.selected }), 'Despesas excluídas.');
          if (result) setModal(null);
        } else {
          const result = await run(() => bulkUpdateBasicExpenses({ organizationId: company.id, ids: modal.selected, ...action.patch }), 'Despesas atualizadas em massa.');
          if (result) setModal(null);
        }
      }}/>} 
      {modal.type === 'reopen' && <ReopenForm busy={busy} onSubmit={async reason => { const result = await run(() => reopenBasicMonth({ organizationId: company.id, month, reason, actorUserId: user.id, organizationName: company.name }), 'Mês reaberto.'); if (result) setModal(null); }}/>} 
    </Modal>}
    {toast && <div className={styles.toast}>{toast}</div>}
  </div>;
}

function Center({ text }) { return <div className={styles.center}><div className={styles.loader}/><span>{text}</span></div>; }

function Login({ onSubmit, busy, error }) {
  return <div className={styles.loginPage}><div className={styles.loginVisual}><div className={styles.loginBrand}><div className={styles.brandMark}>LG</div><div><strong>Central Financeira</strong><span>Contador Luid Gabriel</span></div></div><div className={styles.loginCopy}><span>Controle Básico</span><h1>Faturamento e despesas no mesmo lugar.</h1><p>Acompanhe o que a empresa faturou, o que gastou e o resultado gerencial sem transformar sua rotina em um ERP.</p></div></div><form className={styles.loginCard} onSubmit={onSubmit}><div><span className={styles.eyebrow}>Acesso seguro</span><h2>Entrar na Central</h2><p>Use o e-mail e a senha vinculados à sua empresa.</p></div>{error && <div className={styles.formError}>{error}</div>}<label>E-mail<input name="email" type="email" required autoComplete="email"/></label><label>Senha<input name="password" type="password" required autoComplete="current-password"/></label><button className={styles.primaryButton} disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button></form></div>;
}

function NavButton({ active, icon, label, onClick }) { return <button className={`${styles.navButton} ${active ? styles.navButtonActive : ''}`} onClick={onClick}><Icon name={icon}/><span>{label}</span></button>; }
function MonthPicker({ value, startMonth, onChange }) { return <label className={styles.monthPicker}><Icon name="calendar"/><input type="month" min={startMonth || undefined} value={value} onChange={e => onChange(e.target.value)}/></label>; }
function PageHeader({ title, description, children }) { return <div className={styles.pageHeader}><div><h1>{title}</h1><p>{description}</p></div>{children && <div className={styles.pageActions}>{children}</div>}</div>; }
function Metric({ label, value, detail }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

function Overview({ month, revenueMode, expenseMode, entries, previousEntries, status, locked, onRevenue, onExpense, onClosing }) {
  const revenues = byType(entries, 'revenue');
  const expenses = byType(entries, 'expense');
  const revenue = netTotal(revenues);
  const expense = netTotal(expenses);
  const result = revenue - expense;
  const margin = revenue > 0 ? result / revenue * 100 : null;
  const currentDay = new Date().getDate();
  const comparableRevenue = month === monthKey() && revenueMode !== 'monthly' ? revenues.filter(e => e.entry_status !== 'cancelled' && dayOf(e.date) <= currentDay) : revenues;
  const comparableExpense = month === monthKey() && expenseMode !== 'monthly' ? expenses.filter(e => e.entry_status !== 'cancelled' && dayOf(e.date) <= currentDay) : expenses;
  const prevRevenueEntries = byType(previousEntries, 'revenue');
  const prevExpenseEntries = byType(previousEntries, 'expense');
  const prevRevenue = netTotal(month === monthKey() && revenueMode !== 'monthly' ? prevRevenueEntries.filter(e => dayOf(e.date) <= currentDay) : prevRevenueEntries);
  const prevExpense = netTotal(month === monthKey() && expenseMode !== 'monthly' ? prevExpenseEntries.filter(e => dayOf(e.date) <= currentDay) : prevExpenseEntries);
  const prevResult = prevRevenue - prevExpense;
  const comparableResult = netTotal(comparableRevenue) - netTotal(comparableExpense);
  const variation = prevResult !== 0 ? (comparableResult - prevResult) / Math.abs(prevResult) * 100 : null;
  const activeExpenses = expenses.filter(e => e.entry_status === 'active');
  const groupedCategories = groupRows(activeExpenses, e => e.category?.name);
  const groupedSuppliers = groupRows(activeExpenses, e => e.supplier?.name);
  const topExpenseCategory = groupedCategories[0] || null;
  const topSupplier = groupedSuppliers[0] || null;
  return <>
    <PageHeader title={monthName(month)} description={`${status} · Receitas: ${revenueModeName(revenueMode)} · Despesas: ${expenseModeName(expenseMode)}`}/>
    <section className={styles.heroCard}><div><span>Resultado gerencial</span><strong>{money(result)}</strong><p>{variation === null ? 'Sem base suficiente para comparação.' : `${variation >= 0 ? '+' : ''}${percent(variation)} em relação ao período comparável anterior.`}</p></div><div className={styles.heroBreakdown}><div><span>Faturamento após ajustes</span><b>{money(revenue)}</b></div><div><span>Despesas após ajustes</span><b>{money(expense)}</b></div><div><span>Margem gerencial</span><b>{margin === null ? '—' : percent(margin)}</b></div></div></section>
    <div className={styles.metricGrid}><Metric label="Faturamento bruto" value={money(activeTotal(revenues))} detail={`${revenues.filter(e => e.entry_status === 'active').length} lançamentos ativos`}/><Metric label="Despesas brutas" value={money(activeTotal(expenses))} detail={`${activeExpenses.length} lançamentos ativos`}/><Metric label="Estornos de receita" value={money(adjustmentTotal(revenues, 'negative'))} detail="Reduz o faturamento"/><Metric label="Reembolsos de despesa" value={money(adjustmentTotal(expenses, 'negative'))} detail="Reduz as despesas"/>{expenseMode === 'individual' && <Metric label="Maior grupo de despesa" value={topExpenseCategory?.[0] || topSupplier?.[0] || '—'} detail={topExpenseCategory ? money(topExpenseCategory[1]) : topSupplier ? money(topSupplier[1]) : 'Sem detalhamento'}/>}</div>
    <div className={styles.reportGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Receitas</h3><p>Faturamento informado no período.</p></div><button className={styles.linkButton} onClick={onRevenue}>Ver receitas <Icon name="arrow"/></button></div><div className={styles.summaryRows}><div><span>Após ajustes</span><b>{money(revenue)}</b></div><div><span>Modo</span><b>{revenueModeName(revenueMode)}</b></div></div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Despesas</h3><p>Gastos do negócio referentes ao período.</p></div><button className={styles.linkButton} onClick={onExpense}>Ver despesas <Icon name="arrow"/></button></div><div className={styles.summaryRows}><div><span>Após ajustes</span><b>{money(expense)}</b></div><div><span>Modo</span><b>{expenseModeName(expenseMode)}</b></div></div></section></div>
    <div className={styles.infoBox} style={{marginTop:12}}><strong>Leitura gerencial</strong><span>Resultado gerencial = faturamento após ajustes − despesas após ajustes. Não é lucro contábil nem saldo bancário.</span></div>
    <div className={styles.bottomAction}><button className={styles.secondaryButton} onClick={onClosing}>{locked ? 'Ver fechamento' : 'Concluir mês'}</button></div>
  </>;
}

function filterEntries({ entries, search, filters, partyKey }) {
  const q = search.trim().toLowerCase();
  let list = entries.filter(entry => {
    const party = partyKey === 'customer' ? entry.customer?.name : entry.supplier?.name;
    if (q && !`${entry.description || ''} ${party || ''} ${entry.category?.name || ''}`.toLowerCase().includes(q)) return false;
    if (filters.category && entry.category_id !== filters.category) return false;
    if (filters.customer && entry.customer_id !== filters.customer) return false;
    if (filters.supplier && entry.supplier_id !== filters.supplier) return false;
    if (filters.payment && entry.payment_method_id !== filters.payment) return false;
    if (filters.min && Number(entry.amount) < Number(filters.min)) return false;
    if (filters.max && Number(entry.amount) > Number(filters.max)) return false;
    return true;
  });
  if (filters.sort === 'value_desc') list = list.sort((a, b) => Number(b.amount) - Number(a.amount));
  else if (filters.sort === 'value_asc') list = list.sort((a, b) => Number(a.amount) - Number(b.amount));
  else list = list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list;
}

function RevenuePage({ mode, month, currentMonth, entries, categories, customers, paymentMethods, locked, search, setSearch, filters, setFilters, onAdd, onImport, onEdit, onDelete, onCancel, onAdjustment }) {
  const list = filterEntries({ entries, search, filters, partyKey: 'customer' });
  const historicalLocked = locked && month < currentMonth;
  return <><PageHeader title="Receitas" description={`Faturamento de ${monthName(month).toLowerCase()}.`}>{!locked && <><button className={styles.secondaryButtonSmall} onClick={onImport}><Icon name="download"/>Importar</button><button className={styles.secondaryButtonSmall} onClick={onAdjustment}>Ajuste</button><button className={styles.primaryButtonSmall} onClick={onAdd}><Icon name="plus"/>Registrar</button></>}</PageHeader>{locked && <LockBar historical={historicalLocked}/>}<Filters kind="revenue" mode={mode} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} categories={categories} parties={customers} paymentMethods={paymentMethods}/><EntryTable kind="revenue" mode={mode} entries={list} locked={locked} historicalLocked={historicalLocked} onEdit={onEdit} onDelete={onDelete} onCancel={onCancel}/></>;
}

function ExpensePage({ mode, month, currentMonth, entries, categories, suppliers, paymentMethods, locked, search, setSearch, filters, setFilters, onAdd, onImport, onEdit, onDelete, onCancel, onAdjustment, onBulk }) {
  const [selected, setSelected] = useState([]);
  useEffect(() => setSelected([]), [month, mode]);
  const list = filterEntries({ entries, search, filters, partyKey: 'supplier' });
  const historicalLocked = locked && month < currentMonth;
  const selectable = list.filter(e => e.entry_status === 'active');
  const toggle = id => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return <><PageHeader title="Despesas" description={`Gastos de ${monthName(month).toLowerCase()}.`}>{!locked && <><button className={styles.secondaryButtonSmall} onClick={onImport}><Icon name="download"/>Importar</button><button className={styles.secondaryButtonSmall} onClick={onAdjustment}>Ajuste</button><button className={styles.primaryButtonSmall} onClick={onAdd}><Icon name="plus"/>Registrar</button></>}</PageHeader>{locked && <LockBar historical={historicalLocked}/>}<Filters kind="expense" mode={mode} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} categories={categories} parties={suppliers} paymentMethods={paymentMethods}/>{mode === 'individual' && !locked && selected.length > 0 && <div className={styles.lockBar}><div style={{flex:1}}><strong>{selected.length} despesas selecionadas</strong><span>Altere categoria, fornecedor ou meio de pagamento em massa, ou exclua lançamentos incorretos.</span></div><button className={styles.primaryButtonSmall} onClick={() => onBulk(selected)}>Ações em massa</button></div>}<EntryTable kind="expense" mode={mode} entries={list} locked={locked} historicalLocked={historicalLocked} onEdit={onEdit} onDelete={onDelete} onCancel={onCancel} selection={mode === 'individual' && !locked ? { selected, toggle, all: selectable.length > 0 && selectable.every(e => selected.includes(e.id)), toggleAll: () => setSelected(selected.length === selectable.length ? [] : selectable.map(e => e.id)) } : null}/></>;
}

function LockBar({ historical }) { return <div className={styles.lockBar}><Icon name="lock"/><div><strong>Mês concluído</strong><span>{historical ? 'O histórico permanece bloqueado. Cancelamentos posteriores viram ajuste no mês atual.' : 'Reabra o período antes de alterar lançamentos.'}</span></div></div>; }

function Filters({ kind, mode, search, setSearch, filters, setFilters, categories, parties, paymentMethods }) {
  const detailed = mode === 'individual';
  return <div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search"/><input placeholder={kind === 'revenue' ? 'Buscar receita' : 'Buscar despesa'} value={search} onChange={e => setSearch(e.target.value)}/></label>{detailed && <><select value={kind === 'revenue' ? filters.customer : filters.supplier} onChange={e => setFilters({ ...filters, [kind === 'revenue' ? 'customer' : 'supplier']: e.target.value })}><option value="">{kind === 'revenue' ? 'Todos os clientes' : 'Todos os fornecedores'}</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">Todas as categorias</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={filters.payment} onChange={e => setFilters({ ...filters, payment: e.target.value })}><option value="">Todos os meios</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input style={{height:40,width:105,border:'1px solid #E4E9F1',borderRadius:10,padding:'0 10px'}} type="number" min="0" step="0.01" placeholder="Valor mín." value={filters.min} onChange={e => setFilters({ ...filters, min: e.target.value })}/><input style={{height:40,width:105,border:'1px solid #E4E9F1',borderRadius:10,padding:'0 10px'}} type="number" min="0" step="0.01" placeholder="Valor máx." value={filters.max} onChange={e => setFilters({ ...filters, max: e.target.value })}/><select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value })}><option value="date_desc">Mais recentes</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></>}</div>;
}

function EntryTable({ kind, mode, entries, locked, historicalLocked, onEdit, onDelete, onCancel, selection }) {
  const detailed = mode === 'individual';
  return <section className={styles.panel}><div className={styles.tableWrap}><table><thead><tr>{selection && <th><input type="checkbox" checked={selection.all} onChange={selection.toggleAll}/></th>}<th>Data</th><th>Descrição</th>{detailed && <><th>{kind === 'revenue' ? 'Cliente' : 'Fornecedor'}</th><th>Categoria</th><th>Pagamento</th></>}<th>Status</th><th>Valor</th><th/></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}>{selection && <td><input type="checkbox" disabled={entry.entry_status !== 'active'} checked={selection.selected.includes(entry.id)} onChange={() => selection.toggle(entry.id)}/></td>}<td>{formatDate(entry.date)}</td><td><strong>{entry.description || (mode === 'monthly' ? (kind === 'revenue' ? 'Faturamento do mês' : 'Despesas do mês') : kind === 'revenue' ? 'Receita' : 'Despesa')}</strong></td>{detailed && <><td>{kind === 'revenue' ? (entry.customer?.name || 'Consumidor final') : (entry.supplier?.name || 'Fornecedor não informado')}</td><td>{entry.category?.name || '—'}</td><td>{entry.paymentMethod?.name || 'Não informado'}</td></>}<td><StatusPill entry={entry} kind={kind}/></td><td className={styles.moneyCell}>{entry.entry_status === 'adjustment' && entry.adjustment_kind === 'negative' ? '− ' : entry.entry_status === 'adjustment' && entry.adjustment_kind === 'positive' ? '+ ' : ''}{money(entry.amount)}</td><td><div className={styles.rowActions}>{entry.entry_status === 'active' && <>{!locked && <><button title="Editar" onClick={() => onEdit(entry)}><Icon name="edit"/></button><button title="Excluir lançamento incorreto" onClick={() => { if (window.confirm('Excluir este lançamento? Use cancelar/estornar quando ele realmente existiu.')) onDelete(entry); }}><Icon name="trash"/></button></>}{(!locked || historicalLocked) && <button title={historicalLocked ? 'Registrar ajuste no mês atual' : 'Cancelar/estornar'} onClick={() => onCancel(entry)}><Icon name="refresh"/></button>}</>}</div></td></tr>)}{!entries.length && <tr><td colSpan={detailed ? 9 : 6}><div className={styles.emptyInline}>Nenhum lançamento encontrado.</div></td></tr>}</tbody></table></div></section>;
}

function StatusPill({ entry, kind }) {
  const text = entry.entry_status === 'cancelled' ? 'Cancelada' : entry.entry_status === 'adjustment' ? (entry.adjustment_kind === 'negative' ? (kind === 'expense' ? 'Reembolso/estorno' : 'Estorno') : 'Ajuste positivo') : 'Ativa';
  return <span className={`${styles.statusPill} ${entry.entry_status === 'active' ? styles.statusGood : styles.statusMuted}`}>{text}</span>;
}

function PartyPage({ title, kind, parties, entries, onCreate, onEdit, onToggle, onDelete, onMerge }) {
  const normal = parties.filter(p => kind === 'customer' ? !p.is_consumer_final : !p.is_unspecified);
  const rows = normal.map(party => {
    const linked = entries.filter(e => (kind === 'customer' ? e.customer_id : e.supplier_id) === party.id && e.entry_status === 'active');
    const total = linked.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const last = [...linked].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return { party, total, count: linked.length, average: linked.length ? total / linked.length : 0, last };
  }).sort((a, b) => b.total - a.total);
  return <><PageHeader title={title} description={kind === 'customer' ? 'Cadastro financeiro leve dos clientes vinculados às receitas.' : 'Cadastro financeiro leve dos fornecedores vinculados às despesas.'}><button className={styles.secondaryButtonSmall} onClick={onMerge}>Mesclar</button><button className={styles.primaryButtonSmall} onClick={onCreate}><Icon name="plus"/>Novo</button></PageHeader><div className={styles.customerGrid}>{rows.map(({ party, total, count, average, last }) => <article className={`${styles.customerCard} ${!party.active ? styles.customerInactive : ''}`} key={party.id}><button className={styles.customerMain} onClick={() => onEdit(party)}><div className={styles.customerAvatar}>{initials(party.name)}</div><div><strong>{party.name}</strong><span>{party.code}{party.external_code ? ` · ${party.external_code}` : ''}</span></div></button><div className={styles.customerStats}><div><span>Total</span><b>{money(total)}</b></div><div><span>Lançamentos</span><b>{count}</b></div><div><span>Média</span><b>{money(average)}</b></div></div><div className={styles.customerFoot}><span>{last ? `Última: ${formatDate(last.date)}` : 'Sem lançamentos'}</span><div><button onClick={() => onEdit(party)}>Editar</button>{count === 0 ? <button onClick={() => onDelete(party)}>Excluir</button> : <button onClick={() => onToggle(party)}>{party.active ? 'Inativar' : 'Reativar'}</button>}</div></div></article>)}</div></>;
}

function Reports({ company, month, revenueMode, expenseMode, entries }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const current = entries.filter(e => e.month === month);
  const revenues = byType(current, 'revenue');
  const expenses = byType(current, 'expense');
  const revenue = netTotal(revenues);
  const expense = netTotal(expenses);
  const result = revenue - expense;
  const margin = revenue > 0 ? result / revenue * 100 : null;
  const activeExpenses = expenses.filter(e => e.entry_status === 'active');
  const categories = groupRows(activeExpenses, e => e.category?.name);
  const suppliers = groupRows(activeExpenses, e => e.supplier?.name);
  const payments = groupRows(activeExpenses, e => e.paymentMethod?.name);
  const months = [...new Set(entries.map(e => e.month))].sort().slice(-12);
  const evolution = months.map(key => {
    const rows = entries.filter(e => e.month === key);
    const r = netTotal(byType(rows, 'revenue'));
    const x = netTotal(byType(rows, 'expense'));
    return [monthName(key), r - x];
  });
  const exportCsv = () => {
    const header = ['Tipo','Data','Competência','Valor','Descrição','Parte','Categoria','Meio de pagamento','Status'];
    const rows = entries.map(e => [e.type === 'revenue' ? 'Receita' : 'Despesa', formatDate(e.date), e.month, Number(e.amount || 0).toFixed(2).replace('.', ','), e.description || '', e.type === 'revenue' ? (e.customer?.name || '') : (e.supplier?.name || ''), e.category?.name || '', e.paymentMethod?.name || '', e.entry_status]);
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `controle-basico-${company.name.replace(/\s+/g, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = entries.map(e => ({ Tipo: e.type === 'revenue' ? 'Receita' : 'Despesa', Data: formatDate(e.date), Competência: e.month, Valor: Number(e.amount || 0), Descrição: e.description || '', Cliente_Fornecedor: e.type === 'revenue' ? (e.customer?.name || '') : (e.supplier?.name || ''), Categoria: e.category?.name || '', 'Meio de pagamento': e.paymentMethod?.name || '', Status: e.entry_status }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Movimentos');
    XLSX.writeFile(workbook, `controle-basico-${company.name.replace(/\s+/g, '-').toLowerCase()}.xlsx`);
  };
  const exportPdf = async () => { if (pdfBusy) return; setPdfBusy(true); try { await generateBasicControlPdf({ company, month, revenueMode: revenueModeName(revenueMode), expenseMode: expenseModeName(expenseMode), entries }); } finally { setPdfBusy(false); } };
  return <><PageHeader title="Relatórios" description="Receitas, despesas e resultado gerencial conforme o detalhe disponível."><button className={styles.primaryButtonSmall} disabled={pdfBusy} onClick={exportPdf}><Icon name="download"/>{pdfBusy ? 'Gerando PDF…' : 'PDF'}</button><button className={styles.secondaryButtonSmall} onClick={exportExcel}><Icon name="download"/>Excel</button><button className={styles.secondaryButtonSmall} onClick={exportCsv}><Icon name="download"/>CSV</button></PageHeader><div className={styles.metricGrid}><Metric label="Faturamento" value={money(revenue)} detail="Após ajustes"/><Metric label="Despesas" value={money(expense)} detail="Após ajustes"/><Metric label="Resultado gerencial" value={money(result)} detail="Faturamento − despesas"/><Metric label="Margem gerencial" value={margin === null ? '—' : percent(margin)} detail="Resultado ÷ faturamento"/></div><div className={styles.reportGrid}><ReportCard title="Evolução do resultado" rows={evolution}/>{expenseMode === 'individual' && <><ReportCard title="Despesas por categoria" rows={categories.slice(0, 8)}/><ReportCard title="Despesas por fornecedor" rows={suppliers.slice(0, 8)}/><ReportCard title="Despesas por pagamento" rows={payments.slice(0, 8)}/></>}</div></>;
}

function groupRows(items, getKey) { return [...items.reduce((map, item) => { const key = getKey(item) || 'Não informado'; map.set(key, (map.get(key) || 0) + Number(item.amount || 0)); return map; }, new Map()).entries()].sort((a, b) => b[1] - a[1]); }
function ReportCard({ title, rows }) { const max = Math.max(1, ...rows.map(row => Math.abs(Number(row[1] || 0)))); return <section className={styles.panel}><div className={styles.panelHead}><div><h3>{title}</h3><p>Dados gerenciais do histórico informado.</p></div></div><div className={styles.reportRows}>{rows.length ? rows.map(([label, value]) => <div className={styles.reportRow} key={label}><div><span>{label}</span><b>{money(value)}</b></div><div className={styles.bar}><i style={{ width: `${Math.max(3, Math.abs(Number(value || 0)) / max * 100)}%` }}/></div></div>) : <div className={styles.emptyInline}>Sem dados suficientes.</div>}</div></section>; }

function Closing({ month, currentMonth, revenueEntries, expenseEntries, submission, status, busy, onComplete, onReopen }) {
  const [revenueNoMovement, setRevenueNoMovement] = useState(Boolean(submission?.revenueNoMovement));
  const [expenseNoMovement, setExpenseNoMovement] = useState(Boolean(submission?.expenseNoMovement));
  useEffect(() => { setRevenueNoMovement(Boolean(submission?.revenueNoMovement)); setExpenseNoMovement(Boolean(submission?.expenseNoMovement)); }, [submission?.revenueNoMovement, submission?.expenseNoMovement, month]);
  const hasRevenue = revenueEntries.some(e => e.entry_status === 'active' || e.entry_status === 'adjustment');
  const hasExpense = expenseEntries.some(e => e.entry_status === 'active' || e.entry_status === 'adjustment');
  const revenue = netTotal(revenueEntries); const expense = netTotal(expenseEntries); const result = revenue - expense;
  return <><PageHeader title="Fechamento do mês" description="Concluir confirma que receitas e despesas foram conferidas."/><div className={styles.closingGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>{monthName(month)}</h3><p>Status: {status}</p></div><span className={styles.bigStatus}>{status}</span></div><div className={styles.summaryRows}><div><span>Faturamento após ajustes</span><b>{money(revenue)}</b></div><div><span>Despesas após ajustes</span><b>{money(expense)}</b></div><div className={styles.summaryTotal}><span>Resultado gerencial</span><b>{money(result)}</b></div></div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Conferência</h3><p>O mês fica bloqueado depois da conclusão.</p></div></div><div className={styles.closingBody}>{submission?.status === 'confirmed' ? <><div className={styles.infoBox}><strong>Mês concluído</strong><span>Receitas: {submission.revenueNoMovement ? 'sem movimento' : 'informadas'} · Despesas: {submission.expenseNoMovement ? 'sem despesas' : 'informadas'}.</span></div><button className={styles.secondaryButton} onClick={onReopen} disabled={busy}><Icon name="refresh"/>Reabrir mês</button></> : <><label className={`${styles.checkCard} ${hasRevenue ? styles.checkDisabled : ''}`}><input type="checkbox" checked={revenueNoMovement} disabled={hasRevenue} onChange={e => setRevenueNoMovement(e.target.checked)}/><div><strong>Sem faturamento no mês</strong><span>{hasRevenue ? 'Existem receitas/ajustes registrados.' : 'Marque quando o período foi conferido e não houve faturamento.'}</span></div></label><label className={`${styles.checkCard} ${hasExpense ? styles.checkDisabled : ''}`}><input type="checkbox" checked={expenseNoMovement} disabled={hasExpense} onChange={e => setExpenseNoMovement(e.target.checked)}/><div><strong>Sem despesas no mês</strong><span>{hasExpense ? 'Existem despesas/ajustes registrados.' : 'Marque quando o período foi conferido e não houve despesas.'}</span></div></label>{month === currentMonth && (revenueNoMovement || expenseNoMovement) && <div className={styles.infoBox}><strong>O mês ainda está em andamento</strong><span>Você pode concluir, mas confirme se não haverá novos movimentos antes do fim do período.</span></div>}<button className={styles.primaryButton} disabled={busy || (!hasRevenue && !revenueNoMovement) || (!hasExpense && !expenseNoMovement)} onClick={() => onComplete({ revenueNoMovement, expenseNoMovement })}>{busy ? 'Concluindo…' : 'Concluir mês'}</button></>}</div></section></div>{submission?.status === 'reopened' && <div className={styles.historyNote}><strong>Este mês foi reaberto.</strong><span>Motivo: {submission.reopen_reason || 'Não informado'} · Reaberturas: {submission.reopenCount || 1}</span></div>}</>;
}

function Settings({ company, currentMonth, revenueCategories, expenseCategories, paymentMethods, onRevenueMode, onExpenseMode, onTier, onRevenueCategory, onExpenseCategory, onToggleRevenueCategory, onToggleExpenseCategory, onPayment, onTogglePayment }) {
  const [revenueMode, setRevenueMode] = useState(company.pendingRevenueMode || company.revenueMode);
  const [expenseMode, setExpenseMode] = useState(company.pendingExpenseMode || company.expenseMode);
  return <><PageHeader title="Configurações" description="O cliente decide como quer controlar a própria empresa."/><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Nível de controle</h3><p>Controle Básico acompanha faturamento, despesas e resultado gerencial.</p></div></div><div className={styles.settingsBody}><div className={styles.infoBox}><strong>Controle Básico ativo</strong><span>Não inclui contas a pagar, contas a receber, parcelamentos, saldos bancários ou fluxo de caixa projetado.</span></div><button className={styles.secondaryButton} onClick={() => onTier('simple')}>Voltar ao Controle Simples no próximo mês</button>{company.pendingControlTier && <div className={styles.infoBox}><strong>Mudança programada</strong><span>{company.pendingControlTier === 'simple' ? 'Controle Simples' : 'Controle Básico'} a partir de {monthName(company.pendingControlTierEffective)}.</span></div>}</div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Receitas</h3><p>Mudanças valem no mês seguinte.</p></div></div><div className={styles.settingsBody}><select value={revenueMode} onChange={e => setRevenueMode(e.target.value)}>{SIMPLE_MODES.map(item => <option key={item} value={item}>{revenueModeName(item)}</option>)}</select><button className={styles.secondaryButton} disabled={revenueMode === (company.pendingRevenueMode || company.revenueMode)} onClick={() => onRevenueMode(revenueMode)}>Programar mudança</button></div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Despesas</h3><p>Total do mês ou Cada despesa.</p></div></div><div className={styles.settingsBody}><select value={expenseMode} onChange={e => setExpenseMode(e.target.value)}>{BASIC_EXPENSE_MODES.map(item => <option key={item} value={item}>{expenseModeName(item)}</option>)}</select><button className={styles.secondaryButton} disabled={expenseMode === (company.pendingExpenseMode || company.expenseMode)} onClick={() => onExpenseMode(expenseMode)}>Programar mudança</button></div></section><CatalogPanel title="Categorias de receitas" items={revenueCategories} onAdd={() => onRevenueCategory()} onEdit={onRevenueCategory} onToggle={onToggleRevenueCategory}/><CatalogPanel title="Categorias de despesas" items={expenseCategories} onAdd={() => onExpenseCategory()} onEdit={onExpenseCategory} onToggle={onToggleExpenseCategory}/><CatalogPanel title="Meios de pagamento" items={paymentMethods} onAdd={() => onPayment()} onEdit={onPayment} onToggle={onTogglePayment}/></div><div className={styles.infoBox} style={{marginTop:12}}><strong>Histórico preservado</strong><span>Alterar o modo não reinterpreta meses anteriores. Cada fechamento guarda um snapshot da configuração usada naquele período.</span></div></>;
}
function CatalogPanel({ title, items, onAdd, onEdit, onToggle }) { return <section className={styles.panel}><div className={styles.panelHead}><div><h3>{title}</h3><p>Cadastros gerenciais da empresa.</p></div><button className={styles.iconButton} onClick={onAdd}><Icon name="plus"/></button></div><div className={styles.catalogList}>{items.map(item => <div key={item.id}><div><strong>{item.name}</strong><span>{item.is_default ? 'Padrão' : 'Personalizada'} · {item.active ? 'Ativa' : 'Inativa'}</span></div><div><button onClick={() => onEdit(item)}>Editar</button><button onClick={() => onToggle(item)}>{item.active ? 'Inativar' : 'Reativar'}</button></div></div>)}</div></section>; }

function RevenueForm({ mode, entry, categories, customers, paymentMethods, busy, onQuickCustomer, onSubmit }) {
  const [form, setForm] = useState({ date: entry?.date ? String(entry.date).slice(0,10) : today(), amount: entry?.amount ?? '', description: entry?.description ?? '', categoryId: entry?.category_id ?? '', customerId: entry?.customer_id ?? customers.find(c => c.is_consumer_final)?.id ?? '', paymentMethodId: entry?.payment_method_id ?? '' });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(form); }}><div className={styles.formGrid}>{mode !== 'monthly' && <label>Data<input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} required/></label>}<label>Valor<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})} required/></label><label className={styles.fullField}>Descrição<input value={form.description} onChange={e => setForm({...form,description:e.target.value})}/></label>{mode === 'individual' && <><label>Cliente<select value={form.customerId} onChange={e => setForm({...form,customerId:e.target.value})}>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Categoria<select value={form.categoryId} onChange={e => setForm({...form,categoryId:e.target.value})}><option value="">Não informada</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Meio de pagamento<select value={form.paymentMethodId} onChange={e => setForm({...form,paymentMethodId:e.target.value})}><option value="">Não informado</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div><button type="button" className={styles.secondaryButtonSmall} onClick={onQuickCustomer}>Novo cliente</button></div></>}</div><div className={styles.formActions}><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? 'Salvando…' : 'Salvar receita'}</button></div></form>;
}

function ExpenseForm({ mode, entry, categories, suppliers, paymentMethods, busy, onQuickSupplier, onSubmit }) {
  const [form, setForm] = useState({ date: entry?.date ? String(entry.date).slice(0,10) : today(), amount: entry?.amount ?? '', description: entry?.description ?? '', categoryId: entry?.category_id ?? '', supplierId: entry?.supplier_id ?? suppliers.find(s => s.is_unspecified)?.id ?? '', paymentMethodId: entry?.payment_method_id ?? '' });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(form); }}><div className={styles.infoBox}><strong>Despesa gerencial</strong><span>Registre o gasto referente ao período. O sistema não presume que o dinheiro já saiu da conta.</span></div><div className={styles.formGrid}>{mode !== 'monthly' && <label>Data da despesa<input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} required/></label>}<label>Valor<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({...form,amount:e.target.value})} required/></label><label className={styles.fullField}>Descrição<input value={form.description} onChange={e => setForm({...form,description:e.target.value})}/></label>{mode === 'individual' && <><label>Fornecedor<select value={form.supplierId} onChange={e => setForm({...form,supplierId:e.target.value})}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Categoria<select value={form.categoryId} onChange={e => setForm({...form,categoryId:e.target.value})}><option value="">Não informada</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Meio de pagamento<select value={form.paymentMethodId} onChange={e => setForm({...form,paymentMethodId:e.target.value})}><option value="">Não informado</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div><button type="button" className={styles.secondaryButtonSmall} onClick={onQuickSupplier}>Novo fornecedor</button></div></>}</div><div className={styles.formActions}><button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? 'Salvando…' : 'Salvar despesa'}</button></div></form>;
}

function PartyForm({ kind, party, busy, onSubmit }) {
  const [form, setForm] = useState({ name: party?.name || '', document: party?.document || '', phone: party?.phone || '', email: party?.email || '', externalCode: party?.external_code || '', notes: party?.notes || '' });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); onSubmit(form); }}><div className={styles.formGrid}><label className={styles.fullField}>Nome<input value={form.name} onChange={e => setForm({...form,name:e.target.value})} required/></label><label>CPF/CNPJ<input value={form.document} onChange={e => setForm({...form,document:e.target.value})}/></label><label>Código externo<input value={form.externalCode} onChange={e => setForm({...form,externalCode:e.target.value})}/></label><label>Telefone<input value={form.phone} onChange={e => setForm({...form,phone:e.target.value})}/></label><label>E-mail<input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})}/></label><label className={styles.fullField}>Observações<textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})}/></label></div><div className={styles.formActions}><button className={styles.primaryButton} disabled={busy}>{busy ? 'Salvando…' : `Salvar ${kind === 'customer' ? 'cliente' : 'fornecedor'}`}</button></div></form>;
}

function MergeForm({ kind, parties, busy, onSubmit }) { const [sourceId,setSource]=useState(''); const [targetId,setTarget]=useState(''); return <form className={styles.form} onSubmit={e=>{e.preventDefault();onSubmit({sourceId,targetId});}}><div className={styles.infoBox}><strong>Mesclagem</strong><span>Os lançamentos do cadastro de origem serão movidos para o destino. O cadastro de origem ficará inativo.</span></div><label>{kind} de origem<select value={sourceId} onChange={e=>setSource(e.target.value)} required><option value="">Selecione</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{kind} de destino<select value={targetId} onChange={e=>setTarget(e.target.value)} required><option value="">Selecione</option>{parties.filter(p=>p.id!==sourceId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className={styles.formActions}><button className={styles.primaryButton} disabled={busy || !sourceId || !targetId}>Mesclar</button></div></form>; }
function CatalogForm({ type, item, busy, onSubmit }) { const [name,setName]=useState(item?.name||''); const label=type==='payment'?'meio de pagamento':'categoria'; return <form className={styles.form} onSubmit={e=>{e.preventDefault();onSubmit(name);}}><label>Nome<input value={name} onChange={e=>setName(e.target.value)} required/></label>{type==='payment'&&<div className={styles.infoBox}><strong>Importante</strong><span>“A prazo” não é meio de pagamento. Vencimentos e contas a pagar pertencem ao Controle Completo.</span></div>}<div className={styles.formActions}><button className={styles.primaryButton} disabled={busy}>{busy?'Salvando…':`Salvar ${label}`}</button></div></form>; }

function AdjustmentForm({ kind, busy, onSubmit }) { const [form,setForm]=useState({date:today(),amount:'',direction:'negative',description:''}); const negativeLabel=kind==='expense'?'Reembolso / estorno (reduz despesa)':'Estorno / ajuste negativo'; const positiveLabel=kind==='expense'?'Ajuste positivo (aumenta despesa)':'Ajuste positivo'; return <form className={styles.form} onSubmit={e=>{e.preventDefault();onSubmit(form);}}><div className={styles.infoBox}><strong>{kind==='expense'?'Ajuste de despesa':'Ajuste de faturamento'}</strong><span>{kind==='expense'?'Reembolso/estorno reduz as despesas; ajuste positivo aumenta as despesas.':'Estorno reduz o faturamento; ajuste positivo aumenta o faturamento.'}</span></div><div className={styles.formGrid}><label>Data<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></label><label>Valor<input type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/></label><label>Tipo<select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option value="negative">{negativeLabel}</option><option value="positive">{positiveLabel}</option></select></label><label>Descrição<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label></div><div className={styles.formActions}><button className={styles.primaryButton} disabled={busy}>Registrar ajuste</button></div></form>; }
function CancelForm({ label, busy, onSubmit }) { const [reason,setReason]=useState(''); return <form className={styles.form} onSubmit={e=>{e.preventDefault();onSubmit(reason);}}><div className={styles.infoBox}><strong>Cancelar/estornar não é excluir</strong><span>Use esta ação quando a {label} realmente existiu e depois foi anulada. Se o lançamento foi apenas um erro de digitação, use Excluir antes de fechar o mês.</span></div><label>Motivo<textarea value={reason} onChange={e=>setReason(e.target.value)} required/></label><div className={styles.formActions}><button className={styles.dangerButton} disabled={busy||!reason.trim()}>Confirmar</button></div></form>; }
function ReopenForm({ busy, onSubmit }) { const [reason,setReason]=useState(''); return <form className={styles.form} onSubmit={e=>{e.preventDefault();onSubmit(reason);}}><div className={styles.infoBox}><strong>Reabertura registrada</strong><span>O motivo, usuário, data e quantidade de reaberturas ficam no histórico. Depois será necessário concluir o mês novamente.</span></div><label>Motivo<textarea value={reason} onChange={e=>setReason(e.target.value)} required/></label><div className={styles.formActions}><button className={styles.primaryButton} disabled={busy||!reason.trim()}>Reabrir mês</button></div></form>; }

function BulkExpenseForm({ selected, categories, suppliers, paymentMethods, busy, onSubmit }) {
  const [kind,setKind]=useState('category'); const [value,setValue]=useState('');
  const items=kind==='category'?categories:kind==='supplier'?suppliers:paymentMethods;
  return <div className={styles.form}><div className={styles.infoBox}><strong>{selected.length} despesas selecionadas</strong><span>A alteração em massa só afeta lançamentos ativos do período aberto.</span></div><label>Ação<select value={kind} onChange={e=>{setKind(e.target.value);setValue('');}}><option value="category">Alterar categoria</option><option value="supplier">Alterar fornecedor</option><option value="payment">Alterar meio de pagamento</option><option value="delete">Excluir lançamentos incorretos</option></select></label>{kind!=='delete'&&<label>Novo valor<select value={value} onChange={e=>setValue(e.target.value)}><option value="">Não informado</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className={styles.formActions}><button className={kind==='delete'?styles.dangerButton:styles.primaryButton} disabled={busy} onClick={()=>onSubmit(kind==='delete'?{kind:'delete'}:{kind:'update',patch:kind==='category'?{categoryId:value}:kind==='supplier'?{supplierId:value}:{paymentMethodId:value}})}>{kind==='delete'?'Excluir selecionadas':'Aplicar alteração'}</button></div></div>;
}

function Modal({ title, onClose, children }) { return <div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={styles.modalCard}><div className={styles.modalHead}><div><h3>{title}</h3></div><button onClick={onClose}>×</button></div>{children}</div></div>; }
function modalTitle(type) { return ({revenue:'Receita',expense:'Despesa',revenueImport:'Importar receitas',expenseImport:'Importar despesas',customer:'Cliente',supplier:'Fornecedor',customerMerge:'Mesclar clientes',supplierMerge:'Mesclar fornecedores',revenueCategory:'Categoria de receita',expenseCategory:'Categoria de despesa',payment:'Meio de pagamento',revenueAdjustment:'Ajuste de faturamento',expenseAdjustment:'Ajuste de despesa',revenueCancel:'Cancelar/estornar receita',expenseCancel:'Cancelar/estornar despesa',expenseBulk:'Ações em massa',reopen:'Reabrir mês'})[type] || 'Central Financeira'; }
