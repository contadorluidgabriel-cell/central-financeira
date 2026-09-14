'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_REVENUE_CATEGORIES, nextMonth, previousMonth } from '../lib/demo-data';
import { neonTest } from '../lib/neon-test-client';
import {
  addCategory as addNeonCategory,
  confirmMonth,
  deactivateCategory,
  deleteFinancialEntry,
  ensureCategory,
  reopenMonthSubmission,
  reopenMonthlyClosing,
  saveFinancialEntry,
  saveMonthlyClosing,
  updateCompanyMetadata,
  updateOrganizationSettings
} from '../lib/neon-live-data';
import {
  DEFAULT_FINANCE_MODULES,
  cancelPayable,
  cancelReceivable,
  createCompanyV2,
  createInstallmentPlan,
  deactivateAccount,
  deactivateRecurringItem,
  deleteBudget,
  generateRecurringMonth,
  loadFinanceV2Data,
  normalizeError,
  saveAccount,
  saveBudget,
  saveFinanceProfile,
  saveManualMovement,
  savePayable,
  saveReceivable,
  saveRecurringItem,
  saveTransfer,
  settleInstallment,
  settlePayable,
  settleReceivable
} from '../lib/neon-v2-data';
import { createClientAccess, resetClientPassword, setClientAccessBlocked } from '../lib/client-access';
import styles from './CentralFinanceiraV2.module.css';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const today = () => new Date().toISOString().slice(0, 10);
const monthName = key => {
  const [y, m] = String(key).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)).replace(/^./, c => c.toUpperCase());
};
const shortMonth = key => {
  const [y, m] = String(key).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(y, m - 1, 1)).replace('.', '');
};
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const initials = name => String(name || 'LG').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const modeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada lançamento', category: 'Por categoria' })[mode] || mode;
const accountTypeName = type => ({ cash: 'Dinheiro', bank: 'Banco', digital: 'Conta digital', wallet: 'Carteira', other: 'Outra' })[type] || type;
const planTypeName = type => ({ financing: 'Financiamento', loan: 'Empréstimo', purchase: 'Compra parcelada', tax: 'Parcelamento tributário', other: 'Outro' })[type] || type;
const statusName = status => ({ pending: 'Pendente', partial: 'Parcial', received: 'Recebido', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado' })[status] || status;
const statusClass = status => status === 'overdue' ? styles.statusOverdue : ['paid', 'received'].includes(status) ? styles.statusPaid : status === 'partial' ? styles.statusPartial : styles.statusPending;
const addDays = (dateString, days) => {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
};
const endOfMonth = month => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function Icon({ name }) {
  const common = { className: 'icon', viewBox: '0 0 24 24', 'aria-hidden': true };
  const p = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/><path d="M9 21v-7h6v7"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    back: <path d="m15 18-6-6 6-6"/>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/></>,
    chart: <><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 8M5.5 15A7 7 0 0 0 17.8 17.8L20 16"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    wallet: <><path d="M4 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13"/><path d="M16 13h5"/></>,
    down: <><path d="M12 3v18"/><path d="m18 15-6 6-6-6"/></>,
    up: <><path d="M12 21V3"/><path d="m6 9 6-6 6 6"/></>,
    repeat: <><path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 23-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    building: <><path d="M4 21V5l8-3 8 3v16"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01"/></>
  };
  return <svg {...common}>{p[name] || p.file}</svg>;
}

const MODULE_META = [
  ['receivables', 'Contas a receber', 'Acompanhe valores pendentes e atrasados.'],
  ['payables', 'Contas a pagar', 'Organize vencimentos e pagamentos.'],
  ['accounts', 'Saldos', 'Veja quanto há em cada banco, caixa ou carteira.'],
  ['installments', 'Parcelamentos', 'Controle financiamentos, empréstimos e parcelas.'],
  ['recurring', 'Todo mês', 'Cadastre valores que se repetem sem precisar redigitar.'],
  ['cashflow', 'Previsão', 'Veja como o saldo pode evoluir nos próximos dias.'],
  ['budgets', 'Metas do mês', 'Compare o planejado com o realizado.']
];

const MOBILE_MODULE_PRIORITY = ['receivables', 'payables', 'installments', 'recurring', 'accounts', 'cashflow', 'budgets'];
const MOBILE_SHORT_LABELS = {
  overview: 'Início', transactions: 'Registros', receivables: 'Receber', payables: 'Pagar',
  installments: 'Parcelas', recurring: 'Mensais', accounts: 'Saldos', cashflow: 'Previsão',
  budgets: 'Metas', competence: 'Revisar', reports: 'Histórico', companySettings: 'Ajustes'
};

const defaultCompanyDraft = () => ({ name: '', document: '', contact: '' });

export default function CentralFinanceiraV2() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [state, setState] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [transactionType, setTransactionType] = useState('revenue');
  const [statusFilter, setStatusFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [companyDraft, setCompanyDraft] = useState(defaultCompanyDraft());
  const [accessDraft, setAccessDraft] = useState({ email: '' });
  const [accessResult, setAccessResult] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = event => { if (event.key === 'Escape') setMobileNavOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  const refresh = useCallback(async (preserve = true) => {
    if (!user) return;
    setError('');
    try {
      const data = await loadFinanceV2Data(activeOrganizationId);
      if (data.reload) { window.location.reload(); return; }
      setState(current => {
        const old = preserve ? current : null;
        const isMasterRole = data.systemRole === 'super_admin';
        const selected = old?.selectedCompany && data.companies.some(c => c.id === old.selectedCompany)
          ? old.selectedCompany
          : isMasterRole ? null : (data.companies[0]?.id || null);
        return {
          ...data,
          masterView: old?.masterView || 'portfolio',
          selectedCompany: selected,
          workspaceView: old?.workspaceView || 'overview',
          month: old?.month || data.month
        };
      });
    } catch (e) {
      setError(normalizeError(e));
    }
  }, [user?.id, activeOrganizationId]);

  useEffect(() => {
    if (session.isPending) return;
    if (!user) { setState(null); return; }
    refresh(false);
  }, [session.isPending, user?.id, refresh]);

  const run = async (action, success, { refreshAfter = true } = {}) => {
    setBusy(true); setError('');
    try {
      const result = await action();
      if (refreshAfter) await refresh(true);
      if (success) setToast(success);
      return result;
    } catch (e) {
      const message = normalizeError(e);
      setError(message); setToast(message);
      return null;
    } finally { setBusy(false); }
  };

  async function signIn(e) {
    e.preventDefault(); setAuthBusy(true); setError('');
    const f = new FormData(e.currentTarget);
    try {
      const result = await neonTest.auth.signIn.email({ email: String(f.get('email') || '').trim(), password: String(f.get('password') || '') });
      if (result?.error) throw result.error;
      window.location.reload();
    } catch (e) { setError(normalizeError(e)); setAuthBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); window.location.reload(); }
    finally { setBusy(false); }
  }

  if (session.isPending) return <div className="empty"><strong>Validando acesso…</strong></div>;
  if (!user) return <div className="login">
    <section className="login-hero">
      <div className="brand"><div className="brandmark">LG</div>Central Financeira</div>
      <div className="login-copy"><small>CONTROLE + ACOMPANHAMENTO</small><h1>Seu financeiro em um lugar simples de manter e fácil de entender.</h1><p>Registre o essencial, acompanhe compromissos, projete o caixa e feche cada mês com orientação do contador.</p></div>
      <div style={{ fontSize: 11, color: '#9FB2E1' }}>Central Financeira V2 • Contador Luid Gabriel</div>
    </section>
    <section className="login-side"><div className="login-card"><h2>Acessar plataforma</h2><p>Entre com seu e-mail e senha.</p><form onSubmit={signIn}><div className="field"><label>E-mail</label><input name="email" className="input" type="email" required autoComplete="email"/></div><div className="field"><label>Senha</label><input name="password" className="input" type="password" minLength={8} required autoComplete="current-password"/></div><button className="btn btn-primary btn-block" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Entrar'} <Icon name="arrow"/></button></form>{error && <div className="notice" style={{ color: 'var(--danger)', borderColor: '#F2C9C5' }}>{error}</div>}<div className="notice"><b>Ambiente de validação:</b> continue usando somente dados fictícios até concluirmos os testes de isolamento.</div></div></section>
  </div>;
  if (!state) return <div className="empty"><strong>Carregando sua Central Financeira…</strong>{error && <p>{error}</p>}</div>;

  const isMaster = state.systemRole === 'super_admin';
  const company = id => state.companies.find(c => c.id === id);
  const currentCompany = company(state.selectedCompany);
  const profileFor = id => state.profiles.find(p => p.organizationId === id) || { organizationId: id, modules: { ...DEFAULT_FINANCE_MODULES }, defaultProjectionDays: 30, dashboardMode: 'financial' };
  const modulesFor = c => ({ ...profileFor(c.id).modules, expenses: Boolean(c.expenseEnabled) });
  const categoryRowsFor = (id, type) => state.categoryRows.filter(row => row.organization_id === id && row.type === type && row.active);
  const categoryName = id => state.categoryRows.find(row => row.id === id)?.name || 'Sem categoria';
  const entriesFor = (id, type, month = state.month) => state.entries.filter(e => e.companyId === id && (!type || e.type === type) && e.month === month);
  const receivablesFor = id => state.receivables.filter(x => x.companyId === id && x.status !== 'cancelled');
  const payablesFor = id => state.payables.filter(x => x.companyId === id && x.status !== 'cancelled');
  const accountsFor = id => state.accounts.filter(x => x.companyId === id && x.active);
  const movementsFor = id => state.movements.filter(x => x.companyId === id);
  const plansFor = id => state.installmentPlans.filter(x => x.companyId === id && x.active);
  const installmentsFor = id => state.installments.filter(x => x.companyId === id);
  const recurringFor = id => state.recurringItems.filter(x => x.companyId === id && x.active);
  const budgetsFor = (id, month = state.month) => state.budgets.filter(x => x.companyId === id && x.month === month);
  const submissionFor = (id, month = state.month) => state.submissions.find(x => x.companyId === id && x.month === month);
  const closingFor = (id, month = state.month) => state.closings.find(x => x.companyId === id && x.month === month);
  const isClosed = (id, month = state.month) => Boolean(closingFor(id, month)?.closed);
  const isLocked = (id, month = state.month) => isClosed(id, month) || Boolean(submissionFor(id, month));

  const summaryFor = (id, month = state.month) => {
    const revenue = entriesFor(id, 'revenue', month).reduce((s, e) => s + Number(e.amount || 0), 0);
    const expenses = entriesFor(id, 'expense', month).reduce((s, e) => s + Number(e.amount || 0), 0);
    const openReceivables = receivablesFor(id).filter(x => !['received'].includes(x.status));
    const openPayables = payablesFor(id).filter(x => !['paid'].includes(x.status));
    const receivable = openReceivables.reduce((s, x) => s + x.remaining, 0);
    const payable = openPayables.reduce((s, x) => s + x.remaining, 0);
    const accountBalance = accountsFor(id).reduce((s, x) => s + x.balance, 0);
    const profile = profileFor(id);
    const horizon = addDays(today(), profile.defaultProjectionDays || 30);
    const dueReceivable = openReceivables.filter(x => x.dueDate <= horizon).reduce((s, x) => s + x.remaining, 0);
    const duePayable = openPayables.filter(x => x.dueDate <= horizon).reduce((s, x) => s + x.remaining, 0);
    const dueInstallments = installmentsFor(id).filter(x => !['paid'].includes(x.status) && x.dueDate <= horizon).reduce((s, x) => s + Math.max(0, x.amount - x.paidAmount), 0);
    const overdueReceivables = openReceivables.filter(x => x.status === 'overdue');
    const overduePayables = openPayables.filter(x => x.status === 'overdue');
    return {
      revenue, expenses, periodBalance: revenue - expenses, receivable, payable, accountBalance,
      projected: accountBalance + dueReceivable - duePayable - dueInstallments,
      overdueReceivables, overduePayables, dueInstallments, horizon
    };
  };

  const competenceStatus = id => {
    const closing = closingFor(id), submission = submissionFor(id);
    if (closing?.closed) return ['Fechado', 'closed', 'closed'];
    if (submission && closing) return ['Em análise', 'info', 'analysis'];
    if (submission) return ['Pronto para análise', 'ok', 'ready'];
    if (entriesFor(id).length) return ['Preenchendo', 'info', 'filling'];
    return ['Aguardando dados', 'wait', 'waiting'];
  };

  const missingFor = c => {
    const missing = [];
    const submission = submissionFor(c.id);
    if (!entriesFor(c.id, 'revenue').length && !submission?.revenueNoMovement) missing.push('receitas');
    if (c.expenseEnabled && !entriesFor(c.id, 'expense').length && !submission?.expenseNoMovement) missing.push('despesas');
    return missing;
  };

  const upcomingFor = (id, days = 30) => {
    const limit = addDays(today(), days);
    const items = [];
    for (const x of receivablesFor(id)) if (!['received'].includes(x.status) && x.dueDate <= limit) items.push({ id: `r-${x.id}`, kind: 'in', date: x.dueDate, title: x.description, subtitle: x.customer || 'A receber', amount: x.remaining, status: x.status, record: x });
    for (const x of payablesFor(id)) if (!['paid'].includes(x.status) && x.dueDate <= limit) items.push({ id: `p-${x.id}`, kind: 'out', date: x.dueDate, title: x.description, subtitle: x.supplier || 'A pagar', amount: x.remaining, status: x.status, record: x });
    const planById = new Map(plansFor(id).map(x => [x.id, x]));
    for (const x of installmentsFor(id)) if (!['paid'].includes(x.status) && x.dueDate <= limit) items.push({ id: `i-${x.id}`, kind: 'out', date: x.dueDate, title: planById.get(x.planId)?.description || 'Parcela', subtitle: `Parcela ${x.number}`, amount: Math.max(0, x.amount - x.paidAmount), status: x.status, installment: x });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  };

  const openWorkspace = (id, view = 'overview') => { setMobileNavOpen(false); setState(s => ({ ...s, selectedCompany: id, workspaceView: view })); };
  const closeWorkspace = () => { setMobileNavOpen(false); setState(s => ({ ...s, selectedCompany: isMaster ? null : s.selectedCompany, workspaceView: 'overview' })); };
  const setWorkspaceView = view => { setMobileNavOpen(false); setState(s => ({ ...s, workspaceView: view })); };
  const setMasterView = view => setState(s => ({ ...s, masterView: view, selectedCompany: null }));
  const moveMonth = direction => setState(s => ({ ...s, month: direction < 0 ? previousMonth(s.month) : nextMonth(s.month) }));
  const monthControl = <div className="monthctl"><button onClick={() => moveMonth(-1)}>‹</button><div className="monthlabel">{monthName(state.month)}</div><button onClick={() => moveMonth(1)}>›</button></div>;

  const registrationActionsFor = (c, sourceView = 'overview') => {
    const modules = modulesFor(c);
    const locked = isLocked(c.id);
    const actions = [
      !locked && { id:'revenue', view:'transactions', group:'Agora', icon:'up', title:'Entrada recebida', text:'Registrar uma receita que já entrou.', target:{type:'entry',entryType:'revenue'} },
      !locked && modules.expenses && { id:'expense', view:'transactions', group:'Agora', icon:'down', title:'Saída realizada', text:'Registrar uma despesa que já foi paga.', target:{type:'entry',entryType:'expense'} },
      modules.receivables && { id:'receivable', view:'receivables', group:'Próximos compromissos', icon:'calendar', title:'Valor a receber', text:'Anotar o que um cliente ainda vai pagar.', target:{type:'receivable'} },
      modules.payables && { id:'payable', view:'payables', group:'Próximos compromissos', icon:'calendar', title:'Conta a pagar', text:'Anotar uma conta ou fornecedor com vencimento.', target:{type:'payable'} },
      modules.installments && { id:'installment', view:'installments', group:'Próximos compromissos', icon:'file', title:'Compra ou dívida parcelada', text:'Criar um parcelamento e seus vencimentos.', target:{type:'plan'} },
      modules.recurring && { id:'recurring', view:'recurring', group:'Próximos compromissos', icon:'repeat', title:'Item que acontece todo mês', text:'Cadastrar uma entrada ou saída recorrente.', target:{type:'recurring'} },
      modules.accounts && { id:'account', view:'accounts', group:'Organização', icon:'wallet', title:'Conta, caixa ou carteira', text:'Adicionar um lugar onde o dinheiro fica.', target:{type:'account'} },
      modules.accounts && accountsFor(c.id).length > 0 && { id:'movement', view:'accounts', group:'Organização', icon:'money', title:'Ajuste de saldo', text:'Corrigir uma entrada ou saída de saldo.', target:{type:'movement'} },
      modules.budgets && { id:'budget', view:'budgets', group:'Organização', icon:'target', title:'Meta do mês', text:'Definir um limite de gasto ou meta de receita.', target:{type:'budget'} }
    ].filter(Boolean);
    return actions.sort((a, b) => Number(b.view === sourceView) - Number(a.view === sourceView));
  };

  const openRegistration = (c, sourceView) => {
    setMobileNavOpen(false);
    setModal({ type:'registerMenu', companyId:c.id, sourceView });
  };

  function PageHeader({ title, description, children }) {
    return <div className="pagehead"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="actions">{children}</div>}</div>;
  }

  function EmptyState({ icon = 'file', title, text, action, actionLabel }) {
    return <div className={styles.emptyState}><div className={styles.emptyStateIcon}><Icon name={icon}/></div><h3>{title}</h3><p>{text}</p>{action && <button className="btn btn-primary" onClick={action}><Icon name="plus"/>{actionLabel}</button>}</div>;
  }

  function PortfolioTable({ rows }) {
    if (!rows.length) return <EmptyState icon="users" title="Nenhum cliente cadastrado" text="Cadastre a primeira empresa para começar a montar o acompanhamento financeiro." action={() => { setCompanyDraft(defaultCompanyDraft()); setModal({ type: 'company' }); }} actionLabel="Novo cliente"/>;
    return <div className="tablewrap"><table><thead><tr><th>Cliente</th><th>Acesso</th><th>Receitas</th><th>A receber</th><th>A pagar</th><th>Projeção</th><th>Competência</th><th/></tr></thead><tbody>{rows.map(c => {
      const summary = summaryFor(c.id);
      const competence = competenceStatus(c.id);
      const access = (state.clientAccess || []).find(item => item.organizationId === c.id);
      const accessLabel = !access ? 'Sem acesso' : !access.active ? 'Bloqueado' : access.mustChangePassword ? 'Senha provisória' : 'Ativo';
      const accessClass = !access ? 'wait' : !access.active ? 'closed' : access.mustChangePassword ? 'wait' : 'ok';
      return <tr key={c.id} className="clickable" onClick={() => openWorkspace(c.id)}>
        <td><div className="companycell"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>{c.document || 'Documento não informado'}</span></div></div></td>
        <td><div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}><span className={`status ${accessClass}`}>{accessLabel}</span><button type="button" className="btn btn-secondary" style={{minHeight:32,padding:'6px 10px',fontSize:12}} onClick={event=>{event.stopPropagation();setAccessResult(null);setAccessDraft({email:access?.email||c.contact||''});setModal({type:'access',companyId:c.id})}}>{access?'Gerenciar':'Criar acesso'}</button></div></td>
        <td>{money(summary.revenue)}</td><td>{money(summary.receivable)}</td><td>{money(summary.payable)}</td><td><b className={summary.projected < 0 ? 'negative' : 'positive'}>{money(summary.projected)}</b></td><td><span className={`status ${competence[1]}`}>{competence[0]}</span></td><td><Icon name="arrow"/></td>
      </tr>;
    })}</tbody></table></div>;
  }

  function MasterPortfolio() {
    const rows = state.companies;
    const ready = rows.filter(c => ['ready', 'analysis'].includes(competenceStatus(c.id)[2])).length;
    const waiting = rows.filter(c => ['waiting', 'filling'].includes(competenceStatus(c.id)[2])).length;
    const closed = rows.filter(c => competenceStatus(c.id)[2] === 'closed').length;
    const overdue = rows.reduce((sum, c) => { const s = summaryFor(c.id); return sum + s.overduePayables.length + s.overdueReceivables.length; }, 0);
    const attention = rows.flatMap(c => {
      const s = summaryFor(c.id); const items = [];
      if (competenceStatus(c.id)[2] === 'ready') items.push({ c, text: 'Competência pronta para sua análise', view: 'competence' });
      if (s.overduePayables.length) items.push({ c, text: `${s.overduePayables.length} conta(s) a pagar vencida(s)`, view: 'payables' });
      if (s.overdueReceivables.length) items.push({ c, text: `${s.overdueReceivables.length} recebimento(s) atrasado(s)`, view: 'receivables' });
      return items;
    }).slice(0, 8);
    return <>
      <PageHeader title="Visão geral" description={`Carteira de ${monthName(state.month).toLowerCase()} e o que precisa da sua atenção.`}>
        <button className="btn btn-secondary" onClick={() => refresh(true)} disabled={busy}><Icon name="refresh"/>Atualizar</button>
        <button className="btn btn-primary" onClick={() => { setCompanyDraft(defaultCompanyDraft()); setModal({ type: 'company' }); }}><Icon name="plus"/>Novo cliente</button>
      </PageHeader>
      <div className={styles.portfolioStats}>
        <div className={styles.portfolioCard}><span>Clientes ativos</span><strong>{rows.length}</strong><small>Empresas acompanhadas</small></div>
        <div className={styles.portfolioCard}><span>Aguardando cliente</span><strong>{waiting}</strong><small>Dados ou confirmação pendentes</small></div>
        <div className={styles.portfolioCard}><span>Prontos para análise</span><strong>{ready}</strong><small>Exigem ação do escritório</small></div>
        <div className={styles.portfolioCard}><span>Fechados</span><strong>{closed}</strong><small>{overdue ? `${overdue} pendência(s) financeira(s) na carteira` : 'Sem alertas financeiros críticos'}</small></div>
      </div>
      <div className="grid dashboardgrid">
        <section className="panel"><div className="panelhead"><div><h3>Carteira</h3><p>Resumo financeiro e andamento mensal.</p></div></div><PortfolioTable rows={rows}/></section>
        <section className="panel"><div className="panelhead"><div><h3>Precisa da sua atenção</h3><p>Fila prática de trabalho.</p></div></div><div className="panelbody"><div className={styles.portfolioAttention}>{attention.length ? attention.map((item, i) => <button key={`${item.c.id}-${i}`} className={styles.portfolioAttentionItem} style={{ border: 0, width: '100%', background: 'transparent', textAlign: 'left' }} onClick={() => openWorkspace(item.c.id, item.view)}><div><strong>{item.c.name}</strong><span>{item.text}</span></div><Icon name="arrow"/></button>) : <div className={styles.attentionItem + ' ' + styles.attentionGood}><div className={styles.attentionIcon}><Icon name="check"/></div><div><strong>Nada crítico agora</strong><span>As próximas ações aparecerão aqui conforme a carteira avançar.</span></div></div>}</div></div></section>
      </div>
    </>;
  }

  function MasterClients() {
    const q = search.toLowerCase().trim();
    const rows = state.companies.filter(c => !q || `${c.name} ${c.document} ${c.contact}`.toLowerCase().includes(q));
    return <><PageHeader title="Clientes" description="Acesse o financeiro de cada empresa e acompanhe a configuração escolhida pelo cliente."><button className="btn btn-primary" onClick={() => { setCompanyDraft(defaultCompanyDraft()); setModal({ type: 'company' }); }}><Icon name="plus"/>Novo cliente</button></PageHeader><div className={styles.toolbar}><div className={`search ${styles.miniSearch}`}><Icon name="search"/><input className="input" placeholder="Buscar cliente, CNPJ ou e-mail" value={search} onChange={e => setSearch(e.target.value)}/></div></div><section className="panel"><PortfolioTable rows={rows}/></section></>;
  }

  function MasterClosings() {
    const rows = state.companies.map(c => ({ c, status: competenceStatus(c.id), summary: summaryFor(c.id) }));
    return <><PageHeader title="Fechamentos" description="Acompanhe envio, análise e fechamento da competência."/><section className="panel"><div className="tablewrap"><table><thead><tr><th>Cliente</th><th>Receitas</th><th>Despesas</th><th>Status</th><th>Pendência</th></tr></thead><tbody>{rows.map(({ c, status, summary }) => <tr key={c.id} className="clickable" onClick={() => openWorkspace(c.id, 'competence')}><td><strong>{c.name}</strong></td><td>{money(summary.revenue)}</td><td>{c.expenseEnabled ? money(summary.expenses) : '—'}</td><td><span className={`status ${status[1]}`}>{status[0]}</span></td><td className="muted">{status[2] === 'ready' ? 'Aguardando sua análise' : status[2] === 'closed' ? 'Concluído' : missingFor(c).length ? `Falta: ${missingFor(c).join(' e ')}` : 'Em andamento'}</td></tr>)}</tbody></table></div></section></>;
  }

  function MasterSettings() {
    return <><PageHeader title="Sistema" description="Estado da conta e da versão financeira atual."/><div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Conta</h3><p>Acesso principal da Central.</p></div></div><div className="panelbody"><div className="formgrid"><div className="field full"><label>Nome</label><input className="input" readOnly value={user.name || ''}/></div><div className="field"><label>E-mail</label><input className="input" readOnly value={user.email || ''}/></div><div className="field"><label>Perfil</label><input className="input" readOnly value="Super Admin"/></div></div></div></section><section className="panel span5"><div className="panelhead"><div><h3>Central Financeira V2</h3><p>Estrutura financeira conectada.</p></div></div><div className="panelbody"><div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Motor financeiro ativo</strong><p>Receitas, despesas, contas, recebimentos, pagamentos, parcelamentos, recorrências, fluxo e orçamento.</p></div></div><div className="notice"><b>Ambiente oficial:</b> esta versão usa o backend Neon de produção. O uso com clientes reais deve aguardar a auditoria final de isolamento e permissões.</div></div></section></div></>;
  }

  function Overview({ c }) {
    const s = summaryFor(c.id); const modules = modulesFor(c); const upcoming = upcomingFor(c.id, 30).slice(0, 6);
    const accountBase = modules.accounts ? s.accountBalance : s.periodBalance;
    const attention = [];
    if (s.overduePayables.length) attention.push({ icon: 'alert', title: `${s.overduePayables.length} conta(s) vencida(s)`, text: `Total vencido: ${money(s.overduePayables.reduce((a, b) => a + b.remaining, 0))}`, view: 'payables' });
    if (s.overdueReceivables.length) attention.push({ icon: 'alert', title: `${s.overdueReceivables.length} recebimento(s) atrasado(s)`, text: `Total atrasado: ${money(s.overdueReceivables.reduce((a, b) => a + b.remaining, 0))}`, view: 'receivables' });
    if (s.projected < 0 && modules.cashflow) attention.push({ icon: 'chart', title: 'Previsão de saldo negativa', text: `Previsão até ${formatDate(s.horizon)}: ${money(s.projected)}`, view: 'cashflow' });
    if (missingFor(c).length && !submissionFor(c.id)) attention.push({ icon: 'file', title: 'Revisão do mês incompleta', text: `Falta informar ${missingFor(c).join(' e ')}.`, view: 'competence' });
    return <>
      <div className={styles.heroGrid}>
        <div className={styles.heroPanel}><div><div className={styles.heroLabel}>{modules.accounts ? 'Saldo nas contas' : 'Saldo do período'}</div><div className={styles.heroValue}>{money(accountBase)}</div></div><div className={styles.heroMeta}><div><span>Receitas do mês</span><strong>{money(s.revenue)}</strong></div>{modules.expenses && <div><span>Despesas do mês</span><strong>{money(s.expenses)}</strong></div>}{modules.cashflow && <div><span>Projetado</span><strong>{money(s.projected)}</strong></div>}</div></div>
        <section className="panel"><div className="panelhead"><div><h3>Precisa de atenção</h3><p>O que merece ação agora.</p></div></div><div className="panelbody"><div className={styles.attentionList}>{attention.length ? attention.slice(0, 4).map((a, i) => <button key={i} className={styles.attentionItem} style={{ width: '100%', textAlign: 'left' }} onClick={() => setWorkspaceView(a.view)}><div className={styles.attentionIcon}><Icon name={a.icon}/></div><div><strong>{a.title}</strong><span>{a.text}</span></div></button>) : <div className={`${styles.attentionItem} ${styles.attentionGood}`}><div className={styles.attentionIcon}><Icon name="check"/></div><div><strong>Sem alertas importantes</strong><span>Seu financeiro está sem pendências críticas neste momento.</span></div></div>}</div></div></section>
      </div>
      <div className={styles.metricGrid}>
        <div className={styles.metric}><span>Receitas</span><strong>{money(s.revenue)}</strong><small>{monthName(state.month)}</small></div>
        {modules.expenses && <div className={styles.metric}><span>Despesas</span><strong>{money(s.expenses)}</strong><small>Saldo do período {money(s.periodBalance)}</small></div>}
        {modules.receivables && <div className={styles.metric}><span>A receber</span><strong>{money(s.receivable)}</strong><small>{s.overdueReceivables.length ? `${s.overdueReceivables.length} atrasado(s)` : 'Sem atrasos'}</small></div>}
        {modules.payables && <div className={styles.metric}><span>A pagar</span><strong>{money(s.payable)}</strong><small>{s.overduePayables.length ? `${s.overduePayables.length} vencida(s)` : 'Sem contas vencidas'}</small></div>}
        {modules.cashflow && <div className={`${styles.metric} ${styles.metricEmphasis}`}><span>Saldo projetado</span><strong className={s.projected < 0 ? 'negative' : 'positive'}>{money(s.projected)}</strong><small>Próximos {profileFor(c.id).defaultProjectionDays} dias</small></div>}
      </div>
      {upcoming.length > 0 && <section className={`panel ${styles.sectionGap}`}><div className="panelhead"><div><h3>Próximos compromissos</h3><p>Entradas e saídas previstas nos próximos 30 dias.</p></div><button className="btn btn-ghost" onClick={() => setWorkspaceView('cashflow')}>Ver previsão <Icon name="arrow"/></button></div><div className="panelbody"><Timeline items={upcoming}/></div></section>}
    </>;
  }

  function Timeline({ items }) {
    return <div className={styles.timeline}>{items.map(item => <div className={styles.timelineRow} key={item.id}><div className={styles.timelineDate}>{formatDate(item.date)}</div><div className={styles.timelineDot}><Icon name={item.kind === 'in' ? 'up' : 'down'}/></div><div className={styles.timelineInfo}><strong>{item.title}</strong><span>{item.subtitle} • {statusName(item.status)}</span></div><div className={`${styles.timelineAmount} ${item.kind === 'in' ? styles.amountIn : styles.amountOut}`}>{item.kind === 'in' ? '+' : '−'} {money(item.amount)}</div></div>)}</div>;
  }

  function Transactions({ c }) {
    const type = transactionType; const locked = isLocked(c.id); const list = [...entriesFor(c.id, type)].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const total = list.reduce((s, e) => s + Number(e.amount || 0), 0); const mode = type === 'revenue' ? c.revenueMode : c.expenseMode;
    return <>
      <PageHeader title="Entradas e saídas" description="Receitas e despesas registradas neste mês."/>
      {locked && <div className="lockbar"><div><Icon name="lock"/></div><div><strong>{isClosed(c.id) ? 'Mês fechado' : 'Dados já confirmados'}</strong><p>Os lançamentos ficam bloqueados até uma reabertura.</p></div></div>}
      <div className={styles.toolbar}><div className={styles.segmented}><button className={`${styles.segment} ${type === 'revenue' ? styles.segmentActive : ''}`} onClick={() => setTransactionType('revenue')}>Receitas</button>{c.expenseEnabled && <button className={`${styles.segment} ${type === 'expense' ? styles.segmentActive : ''}`} onClick={() => setTransactionType('expense')}>Despesas</button>}</div><div className="statusStrip"><span className="badge">{modeName(mode)}</span><strong>{money(total)}</strong></div></div>
      <section className="panel">{list.length ? <div className="tablewrap"><table className={styles.financialTable}><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className={styles.right}>Valor</th><th/></tr></thead><tbody>{list.map(item => <tr key={item.id}><td data-label="Data">{formatDate(item.date)}</td><td data-label="Descrição"><strong>{item.description || (type === 'revenue' ? 'Receita' : 'Despesa')}</strong></td><td data-label="Categoria">{item.category}</td><td data-label="Valor" className={`${styles.right} ${type === 'revenue' ? styles.amountIn : styles.amountOut}`}>{money(item.amount)}</td><td data-label="Ações"><div className={styles.rowActions}>{!locked && <><button className={styles.iconButton} title="Editar" onClick={() => setModal({ type: 'entry', companyId: c.id, entryType: type, record: item })}><Icon name="edit"/></button><button className={`${styles.iconButton} ${styles.dangerButton}`} title="Excluir" onClick={() => { if (confirm('Excluir este lançamento?')) run(() => deleteFinancialEntry(item.id), 'Lançamento excluído'); }}><Icon name="trash"/></button></>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={type === 'revenue' ? 'up' : 'down'} title={`Nenhuma ${type === 'revenue' ? 'receita' : 'despesa'} informada`} text={locked?'Este mês está bloqueado para novos registros.':`Use “+ Registrar” para adicionar o primeiro lançamento de ${monthName(state.month).toLowerCase()}.`}/>}</section>
    </>;
  }

  function Receivables({ c }) {
    let list = [...receivablesFor(c.id)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (statusFilter === 'open') list = list.filter(x => !['received'].includes(x.status));
    if (statusFilter === 'overdue') list = list.filter(x => x.status === 'overdue');
    if (statusFilter === 'done') list = list.filter(x => x.status === 'received');
    const totalOpen = receivablesFor(c.id).filter(x => x.status !== 'received').reduce((s, x) => s + x.remaining, 0);
    const overdue = receivablesFor(c.id).filter(x => x.status === 'overdue').reduce((s, x) => s + x.remaining, 0);
    return <><PageHeader title="Contas a receber" description="Veja quem precisa pagar, quando vence e o que já entrou."/><div className={styles.metricGrid}><div className={styles.metric}><span>Em aberto</span><strong>{money(totalOpen)}</strong><small>{receivablesFor(c.id).filter(x => x.status !== 'received').length} título(s)</small></div><div className={`${styles.metric} ${overdue ? styles.metricDanger : ''}`}><span>Atrasado</span><strong>{money(overdue)}</strong><small>{receivablesFor(c.id).filter(x => x.status === 'overdue').length} vencido(s)</small></div></div><div className={styles.toolbar}><div className={styles.segmented}>{[['open','Em aberto'],['overdue','Atrasados'],['done','Recebidos'],['all','Todos']].map(([k,l]) => <button key={k} className={`${styles.segment} ${statusFilter === k ? styles.segmentActive : ''}`} onClick={() => setStatusFilter(k)}>{l}</button>)}</div></div><section className="panel">{list.length ? <div className="tablewrap"><table className={styles.financialTable}><thead><tr><th>Vencimento</th><th>Cliente</th><th>Descrição</th><th>Status</th><th className={styles.right}>Restante</th><th/></tr></thead><tbody>{list.map(item => <tr key={item.id}><td data-label="Vencimento">{formatDate(item.dueDate)}</td><td data-label="Cliente">{item.customer || '—'}</td><td data-label="Descrição"><strong>{item.description}</strong></td><td data-label="Status"><span className={`${styles.statusPill} ${statusClass(item.status)}`}>{statusName(item.status)}</span></td><td data-label="Restante" className={`${styles.right} ${styles.amountIn}`}>{money(item.remaining)}</td><td data-label="Ações"><div className={styles.rowActions}>{item.status !== 'received' && <button className={styles.iconButton} title="Receber" onClick={() => setModal({ type: 'settleReceivable', companyId: c.id, record: item })}><Icon name="check"/></button>}<button className={styles.iconButton} title="Editar" onClick={() => setModal({ type: 'receivable', companyId: c.id, record: item })}><Icon name="edit"/></button>{item.status !== 'received' && <button className={`${styles.iconButton} ${styles.dangerButton}`} title="Cancelar" onClick={() => { if (confirm('Cancelar este recebimento?')) run(() => cancelReceivable(item.id), 'Recebimento cancelado'); }}><Icon name="trash"/></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon="calendar" title="Nenhum recebimento aqui" text="Use “+ Registrar” para anotar o primeiro valor que um cliente precisa pagar."/>}</section></>;
  }

  function Payables({ c }) {
    let list = [...payablesFor(c.id)].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    if (statusFilter === 'open') list = list.filter(x => !['paid'].includes(x.status));
    if (statusFilter === 'overdue') list = list.filter(x => x.status === 'overdue');
    if (statusFilter === 'done') list = list.filter(x => x.status === 'paid');
    const totalOpen = payablesFor(c.id).filter(x => x.status !== 'paid').reduce((s, x) => s + x.remaining, 0);
    const overdue = payablesFor(c.id).filter(x => x.status === 'overdue').reduce((s, x) => s + x.remaining, 0);
    return <><PageHeader title="Contas a pagar" description="Organize vencimentos, fornecedores e pagamentos do negócio."/><div className={styles.metricGrid}><div className={styles.metric}><span>Em aberto</span><strong>{money(totalOpen)}</strong><small>{payablesFor(c.id).filter(x => x.status !== 'paid').length} conta(s)</small></div><div className={`${styles.metric} ${overdue ? styles.metricDanger : ''}`}><span>Vencido</span><strong>{money(overdue)}</strong><small>{payablesFor(c.id).filter(x => x.status === 'overdue').length} conta(s)</small></div></div><div className={styles.toolbar}><div className={styles.segmented}>{[['open','Em aberto'],['overdue','Vencidas'],['done','Pagas'],['all','Todas']].map(([k,l]) => <button key={k} className={`${styles.segment} ${statusFilter === k ? styles.segmentActive : ''}`} onClick={() => setStatusFilter(k)}>{l}</button>)}</div></div><section className="panel">{list.length ? <div className="tablewrap"><table className={styles.financialTable}><thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Status</th><th className={styles.right}>Restante</th><th/></tr></thead><tbody>{list.map(item => <tr key={item.id}><td data-label="Vencimento">{formatDate(item.dueDate)}</td><td data-label="Fornecedor">{item.supplier || '—'}</td><td data-label="Descrição"><strong>{item.description}</strong></td><td data-label="Status"><span className={`${styles.statusPill} ${statusClass(item.status)}`}>{statusName(item.status)}</span></td><td data-label="Restante" className={`${styles.right} ${styles.amountOut}`}>{money(item.remaining)}</td><td data-label="Ações"><div className={styles.rowActions}>{item.status !== 'paid' && <button className={styles.iconButton} title="Pagar" onClick={() => setModal({ type: 'settlePayable', companyId: c.id, record: item })}><Icon name="check"/></button>}<button className={styles.iconButton} title="Editar" onClick={() => setModal({ type: 'payable', companyId: c.id, record: item })}><Icon name="edit"/></button>{item.status !== 'paid' && <button className={`${styles.iconButton} ${styles.dangerButton}`} title="Cancelar" onClick={() => { if (confirm('Cancelar esta conta?')) run(() => cancelPayable(item.id), 'Conta cancelada'); }}><Icon name="trash"/></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon="calendar" title="Nenhuma conta aqui" text="Use “+ Registrar” para anotar a primeira conta com vencimento."/>}</section></>;
  }

  function Accounts({ c }) {
    const accounts = accountsFor(c.id); const movements = [...movementsFor(c.id)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25); const total = accounts.reduce((s, a) => s + a.balance, 0);
    return <><PageHeader title="Saldos" description="Veja quanto há em cada banco, caixa ou carteira."><button className="btn btn-secondary" onClick={() => setModal({ type: 'transfer', companyId: c.id })} disabled={accounts.length < 2}><Icon name="repeat"/>Transferir</button></PageHeader><div className={styles.cashAccounts}><div className={styles.balanceTotal}><span>Saldo total informado</span><strong>{money(total)}</strong></div>{accounts.map(account => <div key={account.id} className={styles.accountCard}><div className={styles.accountTop}><div><div className={styles.accountType}>{accountTypeName(account.type)}</div><h4>{account.name}</h4></div><div className={styles.rowActions}><button className={styles.iconButton} onClick={() => setModal({ type: 'account', companyId: c.id, record: account })}><Icon name="edit"/></button><button className={`${styles.iconButton} ${styles.dangerButton}`} onClick={() => { if (confirm('Desativar esta conta?')) run(() => deactivateAccount(account.id), 'Conta desativada'); }}><Icon name="trash"/></button></div></div><div className={styles.accountBalance}>{money(account.balance)}</div><small>Saldo inicial: {money(account.openingBalance)}</small></div>)}</div><section className={`panel ${styles.sectionGap}`}><div className="panelhead"><div><h3>Histórico dos saldos</h3><p>Entradas e saídas que alteram o valor disponível.</p></div></div>{movements.length ? <div className="tablewrap"><table className={styles.financialTable}><thead><tr><th>Data</th><th>Conta</th><th>Descrição</th><th>Origem</th><th className={styles.right}>Valor</th></tr></thead><tbody>{movements.map(item => { const acc = accounts.find(a => a.id === item.accountId); return <tr key={item.id}><td data-label="Data">{formatDate(item.date)}</td><td data-label="Conta">{acc?.name || 'Conta'}</td><td data-label="Descrição">{item.description}</td><td data-label="Origem">{({ receivable:'Recebimento',payable:'Pagamento',installment:'Parcela',manual:'Manual',transfer:'Transferência' })[item.sourceType] || 'Movimento'}</td><td data-label="Valor" className={`${styles.right} ${item.direction === 'in' ? styles.amountIn : styles.amountOut}`}>{item.direction === 'in' ? '+' : '−'} {money(item.amount)}</td></tr>; })}</tbody></table></div> : <EmptyState icon="wallet" title="Sem alterações de saldo" text="Recebimentos, pagamentos e ajustes aparecerão aqui."/>}</section></>;
  }

  function CashFlow({ c }) {
    const s = summaryFor(c.id); const upcoming = upcomingFor(c.id, 90); const horizons = [7,15,30,60,90];
    const projections = horizons.map(days => { const limit = addDays(today(), days); const incoming = receivablesFor(c.id).filter(x => x.status !== 'received' && x.dueDate <= limit).reduce((a,b) => a + b.remaining,0); const outgoing = payablesFor(c.id).filter(x => x.status !== 'paid' && x.dueDate <= limit).reduce((a,b) => a + b.remaining,0); const installments = installmentsFor(c.id).filter(x => x.status !== 'paid' && x.dueDate <= limit).reduce((a,b) => a + Math.max(0,b.amount-b.paidAmount),0); return { days, value:s.accountBalance+incoming-outgoing-installments, incoming, outgoing:outgoing+installments }; });
    const max = Math.max(1, ...projections.map(x => Math.abs(x.value)));
    return <><PageHeader title="Previsão" description="Veja como o dinheiro pode evoluir com entradas e pagamentos futuros."/><div className={styles.metricGrid}><div className={styles.metric}><span>Saldo disponível</span><strong>{money(s.accountBalance)}</strong><small>Base atual</small></div><div className={styles.metric}><span>A receber</span><strong>{money(s.receivable)}</strong><small>Valores ainda não recebidos</small></div><div className={styles.metric}><span>A pagar</span><strong>{money(s.payable)}</strong><small>Contas ainda não pagas</small></div><div className={`${styles.metric} ${styles.metricEmphasis}`}><span>Previsão para {profileFor(c.id).defaultProjectionDays} dias</span><strong className={s.projected < 0 ? 'negative' : 'positive'}>{money(s.projected)}</strong><small>Inclui parcelas previstas</small></div></div><div className="grid sectiongrid"><section className="panel span5"><div className="panelhead"><div><h3>Cenários</h3><p>Como o saldo pode evoluir.</p></div></div><div className="panelbody">{projections.map(row => <div className={styles.forecastLine} key={row.days}><span>{row.days} dias</span><div className={styles.forecastBar}><div style={{ width: `${Math.max(4, Math.min(100, Math.abs(row.value) / max * 100))}%` }}/></div><strong className={row.value < 0 ? 'negative' : 'positive'}>{money(row.value)}</strong></div>)}</div></section><section className="panel span7"><div className="panelhead"><div><h3>Próximos compromissos</h3><p>Entradas e saídas previstas.</p></div></div><div className="panelbody">{upcoming.length ? <Timeline items={upcoming.slice(0, 10)}/> : <EmptyState icon="calendar" title="Sem compromissos futuros" text="Cadastre valores a pagar, a receber ou parcelamentos para criar uma previsão."/>}</div></section></div></>;
  }

  function Installments({ c }) {
    const plans = plansFor(c.id); const installments = installmentsFor(c.id);
    return <><PageHeader title="Parcelamentos" description="Financiamentos, empréstimos e compras parceladas do negócio."/>{plans.length ? <div className={styles.planGrid}>{plans.map(plan => { const rows = installments.filter(x => x.planId === plan.id).sort((a,b)=>a.number-b.number); const paid = rows.reduce((s,x)=>s+x.paidAmount,0); const total = rows.reduce((s,x)=>s+x.amount,0) || plan.totalAmount; const pct = total ? Math.min(100, paid/total*100) : 0; const next = rows.find(x=>x.status!=='paid'); return <div className={styles.planCard} key={plan.id}><div className={styles.planHeader}><div><h4>{plan.description}</h4><p>{planTypeName(plan.type)} • {plan.creditor || 'Sem credor'}</p></div><span className={styles.statusPill}>{rows.filter(x=>x.status==='paid').length}/{rows.length}</span></div><div className={styles.planValue}>{money(Math.max(0,total-paid))}</div><div className={styles.progressTrack}><div style={{width:`${pct}%`}}/></div><div className={styles.planFooter}><span>Pago {money(paid)}</span><span>{pct.toFixed(0)}%</span></div><div className={styles.installmentList}>{rows.slice(0,6).map(inst => <div className={styles.installmentRow} key={inst.id}><span>#{inst.number}</span><div><strong>{formatDate(inst.dueDate)}</strong><small style={{display:'block'}}>{statusName(inst.status)}</small></div><strong>{money(Math.max(0,inst.amount-inst.paidAmount))}</strong>{inst.status!=='paid' ? <button className={styles.iconButton} onClick={()=>setModal({type:'settleInstallment',companyId:c.id,record:inst,plan})}><Icon name="check"/></button> : <Icon name="check"/>}</div>)}</div>{next && rows.length>6 && <button className="btn btn-ghost" style={{marginTop:8}}>Mais {rows.length-6} parcela(s)</button>}</div>; })}</div> : <EmptyState icon="list" title="Nenhum parcelamento cadastrado" text="Use “+ Registrar” para adicionar uma compra ou dívida parcelada."/>}</>;
  }

  function Recurring({ c }) {
    const items = recurringFor(c.id);
    return <><PageHeader title="Todo mês" description="Cadastre valores que se repetem e prepare o mês sem redigitar."><button className="btn btn-secondary" disabled={!items.length || busy} onClick={async()=>{const ids=await run(()=>generateRecurringMonth({organizationId:c.id,month:state.month,items:state.recurringItems}),null);if(ids)setToast(ids.length?`${ids.length} compromisso(s) gerado(s)`:'Nada novo para gerar neste mês')}}><Icon name="refresh"/>Preparar {shortMonth(state.month)}</button></PageHeader><section className="panel">{items.length ? <div className="tablewrap"><table className={styles.financialTable}><thead><tr><th>Tipo</th><th>Descrição</th><th>Parte</th><th>Dia</th><th className={styles.right}>Valor</th><th/></tr></thead><tbody>{items.map(item=><tr key={item.id}><td data-label="Tipo"><span className={`${styles.statusPill} ${item.direction==='receivable'?styles.statusPaid:styles.statusPending}`}>{item.direction==='receivable'?'A receber':'A pagar'}</span></td><td data-label="Descrição"><strong>{item.description}</strong></td><td data-label="Parte">{item.counterparty||'—'}</td><td data-label="Dia">Dia {item.dayOfMonth}</td><td data-label="Valor" className={styles.right}>{money(item.amount)}</td><td data-label="Ações"><div className={styles.rowActions}><button className={styles.iconButton} onClick={()=>setModal({type:'recurring',companyId:c.id,record:item})}><Icon name="edit"/></button><button className={`${styles.iconButton} ${styles.dangerButton}`} onClick={()=>{if(confirm('Desativar este item mensal?'))run(()=>deactivateRecurringItem(item.id),'Item mensal desativado')}}><Icon name="trash"/></button></div></td></tr>)}</tbody></table></div> : <EmptyState icon="repeat" title="Nenhum item mensal" text="Use “+ Registrar” para cadastrar aluguel, mensalidades, contratos ou receitas frequentes."/>}</section></>;
  }

  function Budgets({ c }) {
    const budgets = budgetsFor(c.id); const monthEntries = entriesFor(c.id);
    const actualFor = row => monthEntries.filter(e => e.type === row.type && (!row.categoryId || e.categoryId === row.categoryId)).reduce((s,e)=>s+Number(e.amount||0),0);
    return <><PageHeader title="Metas do mês" description="Compare o que foi planejado com o que realmente aconteceu."/><section className="panel"><div className="panelhead"><div><h3>{monthName(state.month)}</h3><p>Planejado x realizado.</p></div></div><div className="panelbody">{budgets.length ? <div className={styles.budgetRows}>{budgets.map(row=>{const actual=actualFor(row),pct=row.plannedAmount?actual/row.plannedAmount*100:0,over=row.type==='expense'&&pct>100;return <div className={styles.budgetRow} key={row.id}><div className={styles.budgetLabel}><strong>{row.label||categoryName(row.categoryId)}</strong><span>{row.type==='revenue'?'Receita':'Despesa'}</span></div><div className={`${styles.budgetProgress} ${over?styles.budgetProgressOver:''}`}><div style={{width:`${Math.min(100,pct)}%`}}/></div><div className={styles.budgetNumbers}><strong>{money(actual)} / {money(row.plannedAmount)}</strong><span>{percent(pct)}</span></div><button className={`${styles.iconButton} ${styles.dangerButton}`} onClick={()=>{if(confirm('Excluir esta meta?'))run(()=>deleteBudget(row.id),'Meta excluída')}}><Icon name="trash"/></button></div>})}</div> : <EmptyState icon="target" title="Nenhuma meta para este mês" text="Use “+ Registrar” para criar um limite de despesa ou uma meta de receita."/>}</div></section></>;
  }

  function Competence({ c }) {
    const submission = submissionFor(c.id), closing = closingFor(c.id), status = competenceStatus(c.id), s = summaryFor(c.id), missing = missingFor(c);
    return <><PageHeader title="Revisar o mês" description="Confira, envie e acompanhe o fechamento deste mês."/>
      <div className={styles.metricGrid}><div className={styles.metric}><span>Status</span><strong style={{fontSize:16}}>{status[0]}</strong><small>{monthName(state.month)}</small></div><div className={styles.metric}><span>Receitas</span><strong>{money(s.revenue)}</strong><small>{submission?.revenueNoMovement?'Sem movimento declarado':'Dados registrados'}</small></div>{c.expenseEnabled&&<div className={styles.metric}><span>Despesas</span><strong>{money(s.expenses)}</strong><small>{submission?.expenseNoMovement?'Sem movimento declarado':'Dados registrados'}</small></div>}<div className={styles.metric}><span>Saldo do período</span><strong>{money(s.periodBalance)}</strong><small>Não representa lucro contábil</small></div></div>
      <div className="grid sectiongrid"><section className="panel span5"><div className="panelhead"><div><h3>Checklist do mês</h3><p>O que falta para concluir.</p></div></div><div className="panelbody"><div className={styles.attentionList}><div className={`${styles.attentionItem} ${entriesFor(c.id,'revenue').length||submission?.revenueNoMovement?styles.attentionGood:''}`}><div className={styles.attentionIcon}><Icon name={entriesFor(c.id,'revenue').length||submission?.revenueNoMovement?'check':'alert'}/></div><div><strong>Receitas</strong><span>{entriesFor(c.id,'revenue').length?`${entriesFor(c.id,'revenue').length} registro(s)`:submission?.revenueNoMovement?'Sem movimento declarado':'Ainda não informadas'}</span></div></div>{c.expenseEnabled&&<div className={`${styles.attentionItem} ${entriesFor(c.id,'expense').length||submission?.expenseNoMovement?styles.attentionGood:''}`}><div className={styles.attentionIcon}><Icon name={entriesFor(c.id,'expense').length||submission?.expenseNoMovement?'check':'alert'}/></div><div><strong>Despesas</strong><span>{entriesFor(c.id,'expense').length?`${entriesFor(c.id,'expense').length} registro(s)`:submission?.expenseNoMovement?'Sem movimento declarado':'Ainda não informadas'}</span></div></div>}<div className={`${styles.attentionItem} ${submission?styles.attentionGood:''}`}><div className={styles.attentionIcon}><Icon name={submission?'check':'file'}/></div><div><strong>Confirmação</strong><span>{submission?'Dados enviados para análise':'Cliente ainda precisa confirmar o mês'}</span></div></div><div className={`${styles.attentionItem} ${closing?.closed?styles.attentionGood:''}`}><div className={styles.attentionIcon}><Icon name={closing?.closed?'check':'lock'}/></div><div><strong>Fechamento</strong><span>{closing?.closed?'Mês fechado':closing?'Análise em andamento':'Aguardando análise'}</span></div></div></div></div></section>
        <section className="panel span7"><div className="panelhead"><div><h3>{isMaster?'Análise do contador':'Enviar para análise'}</h3><p>{isMaster?'Registre a leitura e feche o mês.':'Confira os dados antes de concluir.'}</p></div></div><div className="panelbody">{isMaster ? <ClosingForm c={c} submission={submission} closing={closing}/> : <ClientSubmission c={c} submission={submission} missing={missing}/>}</div></section></div>
    </>;
  }

  function ClientSubmission({ c, submission, missing }) {
    if (isClosed(c.id)) return <div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Mês concluído</strong><p>Os dados estão fechados. Consulte o histórico e a análise do contador.</p></div></div>;
    if (submission) return <><div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Dados enviados</strong><p>Este mês está aguardando análise.</p></div></div>{!closingFor(c.id) && <button className="btn btn-secondary" style={{marginTop:12}} onClick={()=>{if(confirm('Reabrir o envio para corrigir os dados?'))run(()=>reopenMonthSubmission(c.id,state.month),'Envio reaberto')}}>Reabrir para corrigir</button>}</>;
    return <><div className="notice" style={{marginTop:0}}><b>Revise antes de enviar.</b> Depois da confirmação, os lançamentos ficam bloqueados até uma reabertura.</div>{missing.length>0&&<p className="muted" style={{fontSize:11}}>Ainda falta informar: {missing.join(' e ')}. Se realmente não houve movimento, você pode declarar isso na confirmação.</p>}<button className="btn btn-primary" onClick={()=>setModal({type:'confirmMonth',companyId:c.id})}><Icon name="check"/>Revisar e confirmar mês</button></>;
  }

  function ClosingForm({ c, submission, closing }) {
    if (!submission && !closing?.closed) return <div className="signal"><div className="signalicon warn"><Icon name="alert"/></div><div><strong>Aguardando confirmação</strong><p>O cliente ainda não enviou os dados desta competência.</p></div></div>;
    if (closing?.closed) return <><div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Mês fechado</strong><p>Esta competência está bloqueada e preservada no histórico.</p></div></div><div style={{marginTop:14}}><strong style={{fontSize:12}}>Análise</strong><p className="muted" style={{fontSize:11,lineHeight:1.5}}>{closing.analysis||'Sem análise registrada.'}</p><strong style={{fontSize:12}}>Ponto de atenção</strong><p className="muted" style={{fontSize:11,lineHeight:1.5}}>{closing.attention||'Sem ponto de atenção.'}</p><strong style={{fontSize:12}}>Recomendação</strong><p className="muted" style={{fontSize:11,lineHeight:1.5}}>{closing.recommendation||'Sem recomendação.'}</p></div><button className="btn btn-secondary" onClick={()=>{if(confirm('Reabrir esta competência?'))run(()=>reopenMonthlyClosing(c.id,state.month),'Competência reaberta')}}>Reabrir competência</button></>;
    return <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const intent=e.nativeEvent.submitter?.value||'draft';await run(()=>saveMonthlyClosing({organizationId:c.id,month:state.month,analysis:String(f.get('analysis')||''),attention:String(f.get('attention')||''),recommendation:String(f.get('recommendation')||''),close:intent==='close'}),intent==='close'?'Competência fechada':'Rascunho salvo')}}><div className="field"><label>Análise do mês</label><textarea className="textarea" name="analysis" defaultValue={closing?.analysis||''} placeholder="O que os números mostram?"/></div><div className="field"><label>Ponto de atenção</label><textarea className="textarea" name="attention" defaultValue={closing?.attention||''} placeholder="O que merece cuidado?"/></div><div className="field"><label>Recomendação</label><textarea className="textarea" name="recommendation" defaultValue={closing?.recommendation||''} placeholder="Qual é a próxima ação recomendada?"/></div><div className="actions"><button className="btn btn-secondary" name="intent" value="draft" disabled={busy}>Salvar rascunho</button><button className="btn btn-primary" name="intent" value="close" disabled={busy}><Icon name="lock"/>Fechar competência</button></div></form>;
  }

  function Reports({ c }) {
    const months = []; let cursor = state.month; for (let i=0;i<6;i++){ months.unshift(cursor); cursor=previousMonth(cursor); }
    const rows = months.map(month=>{const rev=entriesFor(c.id,'revenue',month).reduce((s,e)=>s+Number(e.amount||0),0);const exp=entriesFor(c.id,'expense',month).reduce((s,e)=>s+Number(e.amount||0),0);return{month,rev,exp}});
    const max = Math.max(1,...rows.flatMap(x=>[x.rev,x.exp]));
    const categoryMap = new Map(); for(const e of entriesFor(c.id,'expense'))categoryMap.set(e.category,(categoryMap.get(e.category)||0)+Number(e.amount||0));
    const cats = [...categoryMap.entries()].sort((a,b)=>b[1]-a[1]); const maxCat=Math.max(1,...cats.map(x=>x[1]));
    return <><PageHeader title="Histórico" description="Veja a evolução dos últimos meses e a composição dos gastos."><button className="btn btn-secondary" onClick={()=>exportCsv(c)}><Icon name="download"/>Exportar CSV</button></PageHeader><div className={styles.reportGrid}><section className="panel"><div className="panelhead"><div><h3>Últimos 6 meses</h3><p>Receitas e despesas registradas.</p></div></div><div className="panelbody"><div className={styles.reportBars}>{rows.map(row=><div className={styles.barGroup} key={row.month}><div className={styles.reportBarIn} style={{height:`${Math.max(3,row.rev/max*150)}px`}}/><div className={styles.reportBarOut} style={{height:`${Math.max(3,row.exp/max*150)}px`}}/><span className={styles.barMonth}>{shortMonth(row.month)}</span></div>)}</div><div className={styles.legend}><span className={styles.legendItem}><i className={styles.legendDot}/>Receitas</span><span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendDotSecondary}`}/>Despesas</span></div></div></section><section className="panel"><div className="panelhead"><div><h3>Despesas por categoria</h3><p>{monthName(state.month)}</p></div></div><div className="panelbody"><div className={styles.categoryRows}>{cats.length?cats.map(([name,value])=><div className={styles.categoryRow} key={name}><span className={styles.categoryName}>{name}</span><div className={styles.categoryTrack}><div style={{width:`${value/maxCat*100}%`}}/></div><strong className={styles.categoryAmount}>{money(value)}</strong></div>):<p className="muted" style={{fontSize:11}}>Sem despesas registradas neste mês.</p>}</div></div></section></div><section className={`panel ${styles.sectionGap}`}><div className="panelhead"><div><h3>Resumo por mês</h3><p>Comparativo dos meses recentes.</p></div></div><div className="tablewrap"><table className={styles.financialTable}><thead><tr><th>Mês</th><th className={styles.right}>Receitas</th><th className={styles.right}>Despesas</th><th className={styles.right}>Saldo</th></tr></thead><tbody>{rows.slice().reverse().map(row=><tr key={row.month}><td data-label="Mês">{monthName(row.month)}</td><td data-label="Receitas" className={`${styles.right} ${styles.amountIn}`}>{money(row.rev)}</td><td data-label="Despesas" className={`${styles.right} ${styles.amountOut}`}>{money(row.exp)}</td><td data-label="Saldo" className={styles.right}><strong className={row.rev-row.exp<0?'negative':'positive'}>{money(row.rev-row.exp)}</strong></td></tr>)}</tbody></table></div></section></>;
  }

  function exportCsv(c) {
    const lines = [['tipo','data','descricao','categoria','valor']];
    for (const e of entriesFor(c.id)) lines.push([e.type,e.date,e.description||'',e.category||'',Number(e.amount||0).toFixed(2)]);
    for (const r of receivablesFor(c.id)) lines.push(['a_receber',r.dueDate,r.description,r.customer||'',r.remaining.toFixed(2)]);
    for (const p of payablesFor(c.id)) lines.push(['a_pagar',p.dueDate,p.description,p.supplier||'',p.remaining.toFixed(2)]);
    const csv = lines.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`central-financeira-${c.slug||'empresa'}-${state.month}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function CompanySettings({ c }) {
    const profile = profileFor(c.id); const modules = modulesFor(c); const [draftModules,setDraftModules]=useState(modules); const [projection,setProjection]=useState(profile.defaultProjectionDays||30);
    useEffect(()=>{setDraftModules(modules);setProjection(profile.defaultProjectionDays||30)},[c.id,JSON.stringify(profile.modules),c.expenseEnabled]);
    const customRevenue = categoryRowsFor(c.id,'revenue').filter(x=>!x.is_default); const customExpense = categoryRowsFor(c.id,'expense').filter(x=>!x.is_default);
    async function saveModules(){const payload={...draftModules,expenses:c.expenseEnabled};await run(()=>saveFinanceProfile(c.id,{modules:payload,defaultProjectionDays:projection}),'Personalização atualizada')}
    async function addCategory(e,type){e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('category')||'').trim();if(!name)return;await run(()=>addNeonCategory(c.id,type,name,false),'Categoria adicionada');e.currentTarget.reset()}
    return <><PageHeader title="Personalizar Central" description="Ative somente o que faz sentido para a rotina desta empresa."><button className="btn btn-primary" onClick={saveModules} disabled={busy}>Salvar personalização</button></PageHeader><div className={styles.settingsStack}><section className={styles.settingSection}><div className={styles.settingHeader}><h3>Módulos financeiros</h3><p>Itens desativados somem da navegação do cliente.</p></div><div className={styles.settingBody}><div className={styles.moduleGrid}><div className={`${styles.moduleCard} ${styles.moduleLocked}`}><input type="checkbox" checked readOnly/><div><strong>Receitas</strong><span>Módulo essencial da Central e sempre ativo.</span></div></div><label className={styles.moduleCard}><input type="checkbox" checked={c.expenseEnabled} disabled={!isMaster} onChange={async e=>{if(!isMaster)return;await run(()=>updateOrganizationSettings(c.id,{expenseEnabled:e.target.checked}),'Acompanhamento de despesas atualizado')}}/><div><strong>Despesas</strong><span>Total, categoria ou lançamento individual.</span></div></label>{MODULE_META.map(([key,title,text])=>key==='expenses'?null:<label className={styles.moduleCard} key={key}><input type="checkbox" checked={Boolean(draftModules[key])} onChange={e=>setDraftModules(current=>({...current,[key]:e.target.checked}))}/><div><strong>{title}</strong><span>{text}</span></div></label>)}</div><div className="field" style={{maxWidth:240,marginTop:16}}><label>Horizonte da previsão</label><select className="select" value={projection} onChange={e=>setProjection(Number(e.target.value))}>{[7,15,30,60,90].map(x=><option key={x} value={x}>{x} dias</option>)}</select></div></div></section><section className={styles.settingSection}><div className={styles.settingHeader}><h3>Dados da empresa</h3><p>Identificação usada na Central.</p></div><div className={styles.settingBody}><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await run(()=>updateCompanyMetadata(c,{document:String(f.get('document')||'').trim(),contact:String(f.get('contact')||'').trim()}),'Dados atualizados')}}><div className={styles.formGrid2}><div className="field"><label>CNPJ / CPF</label><input className="input" name="document" defaultValue={c.document==='Não informado'?'':c.document}/></div><div className="field"><label>E-mail principal</label><input className="input" name="contact" type="email" defaultValue={c.contact||''}/></div></div><button className="btn btn-secondary">Salvar dados</button></form></div></section><section className={styles.settingSection}><div className={styles.settingHeader}><h3>Categorias personalizadas</h3><p>Crie categorias específicas sem alterar as categorias padrão.</p></div><div className={styles.settingBody}><div className={styles.formGrid2}><div><form onSubmit={e=>addCategory(e,'revenue')}><div className="field"><label>Nova categoria de receita</label><div className="actions"><input className="input" name="category" placeholder="Ex.: Contratos"/><button className="btn btn-secondary"><Icon name="plus"/></button></div></div></form>{customRevenue.map(row=><div className="setting" key={row.id}><div><h4>{row.name}</h4></div><button className={`${styles.iconButton} ${styles.dangerButton}`} onClick={()=>run(()=>deactivateCategory(c.id,'revenue',row.name),'Categoria removida')}><Icon name="trash"/></button></div>)}</div><div><form onSubmit={e=>addCategory(e,'expense')}><div className="field"><label>Nova categoria de despesa</label><div className="actions"><input className="input" name="category" placeholder="Ex.: Equipamentos"/><button className="btn btn-secondary"><Icon name="plus"/></button></div></div></form>{customExpense.map(row=><div className="setting" key={row.id}><div><h4>{row.name}</h4></div><button className={`${styles.iconButton} ${styles.dangerButton}`} onClick={()=>run(()=>deactivateCategory(c.id,'expense',row.name),'Categoria removida')}><Icon name="trash"/></button></div>)}</div></div></div></section></div></>;
  }

  function Workspace({ c }) {
    const modules = modulesFor(c);
    const navGroups = [
      { label: 'Começar', items: [
        ['overview','home','Início',true]
      ] },
      { label: 'Dia a dia', items: [
        ['transactions','list','Entradas e saídas',true]
      ] },
      { label: 'Compromissos', items: [
        ['receivables','up','A receber',modules.receivables],
        ['payables','down','A pagar',modules.payables],
        ['installments','file','Parcelamentos',modules.installments],
        ['recurring','repeat','Todo mês',modules.recurring]
      ] },
      { label: 'Planejamento', items: [
        ['accounts','wallet','Saldos',modules.accounts],
        ['cashflow','chart','Previsão',modules.cashflow],
        ['budgets','target','Metas do mês',modules.budgets]
      ] },
      { label: 'Fechamento', items: [
        ['competence','check','Revisar o mês',true],
        ['reports','chart','Histórico',true]
      ] },
      { label: 'Configuração', items: [
        ['companySettings','settings','Personalizar',true]
      ] }
    ].map(group => ({ ...group, items: group.items.filter(item => item[3]) })).filter(group => group.items.length);
    const nav = navGroups.flatMap(group => group.items);
    const navByKey = new Map(nav.map(item => [item[0], item]));
    const activeView = navByKey.has(state.workspaceView) ? state.workspaceView : 'overview';
    const registerActions = registrationActionsFor(c, activeView);
    const priorityModule = MOBILE_MODULE_PRIORITY.map(key => navByKey.get(key)).find(Boolean);
    const directMobileKeys = nav.length <= 5
      ? nav.map(([key]) => key)
      : ['overview', 'transactions', priorityModule?.[0], 'competence'].filter(Boolean);
    const directMobileKeySet = new Set(directMobileKeys);
    const mobileItems = directMobileKeys.map(key => navByKey.get(key)).filter(Boolean);
    const overflowGroups = navGroups
      .map(group => ({ ...group, items: group.items.filter(([key]) => !directMobileKeySet.has(key)) }))
      .filter(group => group.items.length);
    const hasMobileOverflow = overflowGroups.length > 0;
    const overflowActive = overflowGroups.some(group => group.items.some(([key]) => key === activeView));
    const content = ({
      overview:<Overview c={c}/>,transactions:<Transactions c={c}/>,receivables:<Receivables c={c}/>,payables:<Payables c={c}/>,accounts:<Accounts c={c}/>,cashflow:<CashFlow c={c}/>,installments:<Installments c={c}/>,recurring:<Recurring c={c}/>,budgets:<Budgets c={c}/>,competence:<Competence c={c}/>,reports:<Reports c={c}/>,companySettings:<CompanySettings c={c}/>
    })[activeView] || <Overview c={c}/>;
    return <><div className={styles.workspaceHeader}><div className={styles.workspaceIdentity}>{isMaster && <button className={styles.workspaceBack} onClick={closeWorkspace}><Icon name="back"/>Carteira</button>}<div className="avatar">{initials(c.name)}</div><div><h2>{c.name}</h2><p>{c.document || 'Documento não informado'} • {monthName(state.month)}</p></div></div><div className={styles.workspaceHeaderActions}><div className="statusStrip"><span className={`status ${competenceStatus(c.id)[1]}`}>{competenceStatus(c.id)[0]}</span></div>{registerActions.length>0&&<button type="button" className={`btn btn-primary ${styles.registerButton}`} onClick={()=>openRegistration(c,activeView)}><Icon name="plus"/>Registrar</button>}</div></div><nav className={styles.moduleNav} aria-label="Áreas da empresa">{navGroups.map(group=><div className={styles.moduleGroup} key={group.label}><span className={styles.moduleGroupLabel}>{group.label}</span><div className={styles.moduleGroupButtons}>{group.items.map(([key,icon,label])=><button type="button" key={key} className={`${styles.moduleButton} ${activeView===key?styles.moduleButtonActive:''}`} onClick={()=>setWorkspaceView(key)}><Icon name={icon}/>{label}</button>)}</div></div>)}</nav>{content}{mobileNavOpen&&hasMobileOverflow&&<><button type="button" className={styles.mobileNavBackdrop} aria-label="Fechar outras áreas" onClick={()=>setMobileNavOpen(false)}/><section id="mobile-nav-sheet" className={styles.mobileNavSheet} role="dialog" aria-modal="true" aria-labelledby="mobile-nav-title"><div className={styles.mobileNavSheetHeader}><div><span>Central Financeira</span><h3 id="mobile-nav-title">Outras áreas</h3></div><button type="button" onClick={()=>setMobileNavOpen(false)} aria-label="Fechar">×</button></div>{overflowGroups.map(group=><div className={styles.mobileNavSheetGroup} key={group.label}><span>{group.label}</span><div>{group.items.map(([key,icon,label])=><button type="button" key={key} className={activeView===key?styles.mobileSheetActive:''} onClick={()=>setWorkspaceView(key)}><Icon name={icon}/><strong>{label}</strong>{activeView===key&&<small>Aberto</small>}</button>)}</div></div>)}</section></>}<nav className={styles.mobileNav} aria-label="Navegação principal no celular">{mobileItems.map(([key,icon,label])=><button type="button" key={key} aria-label={label} aria-current={activeView===key?'page':undefined} className={activeView===key?styles.mobileActive:''} onClick={()=>setWorkspaceView(key)}><Icon name={icon}/><span>{MOBILE_SHORT_LABELS[key]||label}</span></button>)}{hasMobileOverflow&&<button type="button" aria-label="Abrir outras áreas" aria-expanded={mobileNavOpen} aria-controls="mobile-nav-sheet" className={overflowActive||mobileNavOpen?styles.mobileActive:''} onClick={()=>setMobileNavOpen(open=>!open)}><Icon name="more"/><span>Mais</span></button>}</nav></>;
  }

  function Sidebar() {
    const navButton=(key,icon,label)=> <button className={`navbtn ${state.masterView===key&&!state.selectedCompany?'active':''}`} onClick={()=>setMasterView(key)}><Icon name={icon}/>{label}</button>;
    return <aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Central Financeira</div>{isMaster ? <><div className="navtitle">Gestão</div>{navButton('portfolio','home','Visão geral')}{navButton('clients','users','Clientes')}{navButton('closings','check','Fechamentos')}<div className="navtitle">Sistema</div>{navButton('settings','settings','Configurações')}</> : <><div className="navtitle">Minha empresa</div><button className="navbtn active"><Icon name="home"/>Central Financeira</button></>}<div className="sidebottom"><div className="usercard"><div className="avatar">{initials(user.name||'LG')}</div><div><strong>{user.name||user.email}</strong><span>{isMaster?'Super Admin':'Cliente'}</span></div></div><button className="navbtn" onClick={signOut} disabled={busy}><Icon name="logout"/>Sair</button></div></aside>;
  }

  function ModalShell({ title, children, footer, wide = false }) {
    return <div className="modalback"><div className={`modal ${wide?styles.modalWide:''}`}><div className="modalhead"><h3>{title}</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><div className="modalbody">{children}</div>{footer&&<div className="modalfoot">{footer}</div>}</div></div>;
  }

  function Modal() {
    if (!modal) return null;
    const c = company(modal.companyId);
    if (modal.type === 'company') return <ModalShell title="Novo cliente" footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy||!companyDraft.name.trim()} onClick={async()=>{
      const draft={...companyDraft};
      const id=await run(()=>createCompanyV2(draft),null,{refreshAfter:false});
      if(id){
        await refresh(false);
        setCompanyDraft(defaultCompanyDraft());
        if(draft.contact.trim()){
          setAccessResult(null);
          setAccessDraft({email:draft.contact.trim()});
          setModal({type:'access',companyId:id});
        } else {
          setModal(null);
          setToast('Cliente criado. Crie o acesso quando tiver o e-mail de login.');
        }
      }
    }}>Criar cliente</button></>}>
      <div className={styles.formGrid2}>
        <div className="field full"><label>Nome da empresa</label><input className="input" value={companyDraft.name} onChange={e=>setCompanyDraft(d=>({...d,name:e.target.value}))} autoFocus/></div>
        <div className="field"><label>CNPJ / CPF</label><input className="input" value={companyDraft.document} onChange={e=>setCompanyDraft(d=>({...d,document:e.target.value}))}/></div>
        <div className="field"><label>E-mail principal</label><input className="input" type="email" value={companyDraft.contact} onChange={e=>setCompanyDraft(d=>({...d,contact:e.target.value}))}/></div>
      </div>
      <div className={styles.modalHint}><b>Próxima etapa:</b> cadastre a empresa aqui. Depois, crie o acesso com e-mail e senha provisória. No primeiro login, o cliente troca a senha e escolhe como quer controlar a própria empresa.</div>
    </ModalShell>;

    if (!c) return null;

    if (modal.type === 'access') {
      const access = (state.clientAccess || []).find(item => item.organizationId === c.id) || null;
      const statusLabel = !access ? 'Sem acesso' : !access.active ? 'Bloqueado' : access.mustChangePassword ? 'Senha provisória' : 'Ativo';

      const closeAccess = () => {
        setAccessResult(null);
        setModal(null);
      };

      const copyCredentials = async () => {
        if (!accessResult?.temporaryPassword) return;
        const text = `Central Financeira\nAcesso: https://centralfinanceira-peach.vercel.app\nE-mail: ${accessResult.email}\nSenha provisória: ${accessResult.temporaryPassword}\n\nNo primeiro acesso, crie sua senha pessoal.`;
        try {
          await navigator.clipboard.writeText(text);
          setToast('Credenciais copiadas.');
        } catch {
          setToast('Não foi possível copiar automaticamente.');
        }
      };

      const createAccess = async () => {
        const result = await run(
          ()=>createClientAccess({organizationId:c.id,email:accessDraft.email,name:c.name}),
          null,
          {refreshAfter:false}
        );
        if(result){
          setAccessResult(result);
          await refresh(true);
          setToast('Acesso criado com senha provisória.');
        }
      };

      const resetPassword = async () => {
        const result = await run(
          ()=>resetClientPassword({userId:access.userId,email:access.email}),
          null,
          {refreshAfter:false}
        );
        if(result){
          setAccessResult(result);
          await refresh(true);
          setToast('Nova senha provisória gerada.');
        }
      };

      const toggleBlocked = async () => {
        const blocked = access.active;
        const result = await run(async()=>{
          await setClientAccessBlocked({userId:access.userId,blocked});
          return true;
        },null,{refreshAfter:false});
        if(result){
          setAccessResult(null);
          await refresh(true);
          setToast(blocked?'Acesso bloqueado.':'Acesso reativado.');
        }
      };

      return <ModalShell title="Acesso do cliente" footer={<><button className="btn btn-secondary" onClick={closeAccess}>Fechar</button>{!access&&!accessResult&&<button className="btn btn-primary" disabled={busy||!accessDraft.email.trim()} onClick={createAccess}>Criar acesso</button>}</>}>
        <div style={{display:'grid',gap:16}}>
          <div><strong style={{display:'block',fontSize:15}}>{c.name}</strong><span className="muted" style={{fontSize:13}}>{c.document || 'Documento não informado'}</span></div>
          {accessResult?.temporaryPassword ? <>
            <div className={styles.modalHint}><b>Senha provisória criada.</b> Ela é mostrada somente agora. Copie as credenciais e envie ao cliente pelo seu canal habitual.</div>
            <div className={styles.formGrid2}>
              <div className="field full"><label>E-mail de login</label><input className="input" readOnly value={accessResult.email}/></div>
              <div className="field full"><label>Senha provisória</label><input className="input" readOnly value={accessResult.temporaryPassword} onFocus={e=>e.currentTarget.select()}/></div>
            </div>
            <button type="button" className="btn btn-primary" onClick={copyCredentials}>Copiar credenciais</button>
          </> : !access ? <>
            <div className="field"><label>E-mail de login</label><input className="input" type="email" value={accessDraft.email} onChange={e=>setAccessDraft({email:e.target.value})} autoFocus/><span className="help">O sistema gera uma senha provisória. No primeiro login, o cliente será obrigado a criar a própria senha.</span></div>
          </> : <>
            <div className={styles.settlementSummary}>
              <div><span>Status</span><strong>{statusLabel}</strong></div>
              <div><span>E-mail</span><strong style={{fontSize:13}}>{access.email}</strong></div>
              <div><span>Último acesso</span><strong style={{fontSize:13}}>{access.lastLoginAt?new Date(access.lastLoginAt).toLocaleString('pt-BR'):'Ainda não acessou'}</strong></div>
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <button type="button" className="btn btn-secondary" disabled={busy||!access.active} onClick={resetPassword}>Redefinir senha</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={toggleBlocked}>{access.active?'Bloquear acesso':'Reativar acesso'}</button>
            </div>
            <div className={styles.modalHint}>{access.mustChangePassword?<><b>Senha provisória pendente:</b> o cliente ainda precisa entrar e criar a própria senha.</>:<><b>Acesso ativo:</b> a senha atual nunca é exibida ao administrador. Se o cliente esquecer, gere uma nova senha provisória.</>}</div>
          </>}
        </div>
      </ModalShell>;
    }
    if (modal.type === 'registerMenu') {
      const actions = registrationActionsFor(c, modal.sourceView);
      const groups = [...new Set(actions.map(action => action.group))];
      return <ModalShell title="O que você quer registrar?" wide><p className={styles.registerIntro}>Escolha uma ação. A Central mostra apenas o que está disponível para esta empresa.</p><div className={styles.registerGroups}>{groups.map(group=><section key={group}><h4>{group}</h4><div className={styles.registerActionGrid}>{actions.filter(action=>action.group===group).map(action=><button type="button" key={action.id} className={styles.registerAction} onClick={()=>{if(action.target.entryType)setTransactionType(action.target.entryType);setModal({...action.target,companyId:c.id})}}><span className={styles.registerActionIcon}><Icon name={action.icon}/></span><span><strong>{action.title}</strong><small>{action.text}</small></span><Icon name="arrow"/></button>)}</div></section>)}</div></ModalShell>;
    }
    if (modal.type === 'entry') {
      const record=modal.record; const type=modal.entryType; const mode=type==='revenue'?c.revenueMode:c.expenseMode; const categoryRows=categoryRowsFor(c.id,type); const defaultDate=record?.date||`${state.month}-${String(Math.min(new Date().getDate(),28)).padStart(2,'0')}`;
      return <ModalShell title={record?'Editar lançamento':type==='revenue'?'Nova receita':'Nova despesa'} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="entry-form" disabled={busy}>Salvar</button></>}><form id="entry-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const category=String(f.get('category')||'').trim();const categoryId=category?await ensureCategory(state.categoryRows,c.id,type,category):null;const saved=await run(()=>saveFinancialEntry({existingId:record?.id,organizationId:c.id,competency:state.month,occurredOn:String(f.get('date')||''),type,description:String(f.get('description')||''),categoryId,amount:Number(f.get('amount')),mode}),record?'Lançamento atualizado':'Lançamento salvo');if(saved!==null)setModal(null)}}><div className={styles.formGrid2}>{!['monthly','category'].includes(mode)&&<div className="field"><label>Data</label><input className="input" name="date" type="date" defaultValue={defaultDate} required/></div>}<div className={`field ${['monthly','category'].includes(mode)?styles.full:''}`}><label>Valor</label><input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={record?.amount||''} required/></div>{mode==='individual'&&<div className="field full"><label>Descrição</label><input className="input" name="description" defaultValue={record?.description||''} required/></div>}{mode==='daily'&&<div className="field full"><label>Descrição</label><input className="input" name="description" defaultValue={record?.description||'Total do dia'}/></div>}{mode==='category'||mode==='individual'?<div className="field full"><label>Categoria</label><select className="select" name="category" defaultValue={record?.category||categoryRows[0]?.name||''}>{categoryRows.map(row=><option key={row.id} value={row.name}>{row.name}</option>)}</select></div>:null}</div></form></ModalShell>;
    }

    if (modal.type === 'receivable' || modal.type === 'payable') {
      const receive=modal.type==='receivable'; const record=modal.record; const cats=categoryRowsFor(c.id,receive?'revenue':'expense');
      return <ModalShell title={record?`Editar ${receive?'recebimento':'conta'}`:receive?'Novo recebimento':'Nova conta a pagar'} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="commitment-form" disabled={busy}>Salvar</button></>}><form id="commitment-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload={id:record?.id,organizationId:c.id,description:String(f.get('description')||''),categoryId:String(f.get('categoryId')||'')||null,amount:Number(f.get('amount')),issueDate:String(f.get('issueDate')||'')||null,dueDate:String(f.get('dueDate')||''),notes:String(f.get('notes')||'')};if(receive)payload.customer=String(f.get('counterparty')||'');else payload.supplier=String(f.get('counterparty')||'');const saved=await run(()=>receive?saveReceivable(payload):savePayable(payload),receive?'Recebimento salvo':'Conta salva');if(saved!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field full"><label>Descrição</label><input className="input" name="description" defaultValue={record?.description||''} required autoFocus/></div><div className="field"><label>{receive?'Cliente / origem':'Fornecedor'}</label><input className="input" name="counterparty" defaultValue={receive?record?.customer||'':record?.supplier||''}/></div><div className="field"><label>Categoria</label><select className="select" name="categoryId" defaultValue={record?.categoryId||''}><option value="">Sem categoria</option>{cats.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div className="field"><label>Valor</label><input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={record?.amount||''} required/></div><div className="field"><label>Vencimento</label><input className="input" name="dueDate" type="date" defaultValue={record?.dueDate||today()} required/></div><div className="field"><label>Data de origem</label><input className="input" name="issueDate" type="date" defaultValue={record?.issueDate||today()}/></div><div className="field full"><label>Observações</label><textarea className="textarea" name="notes" defaultValue={record?.notes||''}/></div></div></form></ModalShell>;
    }

    if (modal.type === 'settleReceivable' || modal.type === 'settlePayable') {
      const receive=modal.type==='settleReceivable',record=modal.record,accounts=accountsFor(c.id);
      return <ModalShell title={receive?'Registrar recebimento':'Registrar pagamento'} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="settlement-form" disabled={busy}>Confirmar baixa</button></>}><div className={styles.settlementSummary}><div><span>Valor original</span><strong>{money(record.amount)}</strong></div><div><span>Já {receive?'recebido':'pago'}</span><strong>{money(receive?record.receivedAmount:record.paidAmount)}</strong></div><div><span>Restante</span><strong>{money(record.remaining)}</strong></div></div><form id="settlement-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const payload={record,amount:Number(f.get('amount')),date:String(f.get('date')),accountId:String(f.get('accountId')||'')||null};const result=await run(()=>receive?settleReceivable(payload):settlePayable(payload),receive?'Recebimento registrado':'Pagamento registrado');if(result!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field"><label>Valor {receive?'recebido':'pago'}</label><input className="input" name="amount" type="number" min="0.01" step="0.01" max={record.remaining} defaultValue={record.remaining} required/></div><div className="field"><label>Data</label><input className="input" name="date" type="date" defaultValue={today()} required/></div><div className="field full"><label>Conta financeira</label><select className="select" name="accountId"><option value="">Não movimentar saldo de conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} • {money(a.balance)}</option>)}</select><span className="help">Se escolher uma conta, a baixa também atualiza o saldo financeiro.</span></div></div></form></ModalShell>;
    }

    if (modal.type === 'account') {
      const r=modal.record; return <ModalShell title={r?'Editar conta':'Nova conta financeira'} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="account-form">Salvar</button></>}><form id="account-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await run(()=>saveAccount({id:r?.id,organizationId:c.id,name:String(f.get('name')),type:String(f.get('type')),openingBalance:Number(f.get('openingBalance')||0)}),'Conta salva');if(id!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field"><label>Nome</label><input className="input" name="name" defaultValue={r?.name||''} placeholder="Ex.: Banco PJ" required/></div><div className="field"><label>Tipo</label><select className="select" name="type" defaultValue={r?.type||'bank'}><option value="bank">Banco</option><option value="digital">Conta digital</option><option value="cash">Dinheiro / caixa</option><option value="wallet">Carteira</option><option value="other">Outra</option></select></div><div className="field full"><label>Saldo inicial</label><input className="input" name="openingBalance" type="number" step="0.01" defaultValue={r?.openingBalance||0}/><span className="help">Use o saldo que existia quando começou a controlar esta conta na Central.</span></div></div></form></ModalShell>;
    }

    if (modal.type === 'movement') {
      const accounts=accountsFor(c.id); return <ModalShell title="Ajuste manual de saldo" footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="movement-form">Salvar</button></>}><form id="movement-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await run(()=>saveManualMovement({organizationId:c.id,accountId:String(f.get('accountId')),date:String(f.get('date')),direction:String(f.get('direction')),amount:Number(f.get('amount')),description:String(f.get('description'))}),'Movimento registrado');if(id!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field full"><label>Conta</label><select className="select" name="accountId" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div className="field"><label>Tipo</label><select className="select" name="direction"><option value="in">Entrada</option><option value="out">Saída</option></select></div><div className="field"><label>Data</label><input className="input" name="date" type="date" defaultValue={today()} required/></div><div className="field"><label>Valor</label><input className="input" name="amount" type="number" min="0.01" step="0.01" required/></div><div className="field"><label>Descrição</label><input className="input" name="description" placeholder="Motivo do ajuste" required/></div></div></form></ModalShell>;
    }

    if (modal.type === 'transfer') {
      const accounts=accountsFor(c.id); return <ModalShell title="Transferir entre contas" footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="transfer-form">Transferir</button></>}><form id="transfer-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await run(()=>saveTransfer({organizationId:c.id,fromAccountId:String(f.get('from')),toAccountId:String(f.get('to')),date:String(f.get('date')),amount:Number(f.get('amount')),description:String(f.get('description')||'Transferência entre contas')}),'Transferência registrada');if(id!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field"><label>Conta de origem</label><select className="select" name="from" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div className="field"><label>Conta de destino</label><select className="select" name="to" required>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div><div className="field"><label>Valor</label><input className="input" name="amount" type="number" min="0.01" step="0.01" required/></div><div className="field"><label>Data</label><input className="input" name="date" type="date" defaultValue={today()} required/></div><div className="field full"><label>Descrição</label><input className="input" name="description" defaultValue="Transferência entre contas"/></div></div></form></ModalShell>;
    }

    if (modal.type === 'plan') return <ModalShell title="Novo parcelamento" wide footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="plan-form">Criar parcelamento</button></>}><form id="plan-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const count=Number(f.get('count')),amount=Number(f.get('installmentAmount')),total=Number(f.get('totalAmount')||count*amount);const id=await run(()=>createInstallmentPlan({organizationId:c.id,type:String(f.get('type')),description:String(f.get('description')),creditor:String(f.get('creditor')),totalAmount:total,installmentsCount:count,installmentAmount:amount,firstDueDate:String(f.get('firstDueDate')),notes:String(f.get('notes')||'')}),'Parcelamento criado');if(id!==null)setModal(null)}}><div className={styles.formGrid3}><div className="field full"><label>Descrição</label><input className="input" name="description" placeholder="Ex.: Financiamento do veículo" required/></div><div className="field"><label>Tipo</label><select className="select" name="type"><option value="financing">Financiamento</option><option value="loan">Empréstimo</option><option value="purchase">Compra parcelada</option><option value="tax">Parcelamento tributário</option><option value="other">Outro</option></select></div><div className="field"><label>Credor</label><input className="input" name="creditor"/></div><div className="field"><label>Total contratado</label><input className="input" name="totalAmount" type="number" min="0" step="0.01"/></div><div className="field"><label>Quantidade de parcelas</label><input className="input" name="count" type="number" min="1" max="240" required/></div><div className="field"><label>Valor da parcela</label><input className="input" name="installmentAmount" type="number" min="0.01" step="0.01" required/></div><div className="field"><label>Primeiro vencimento</label><input className="input" name="firstDueDate" type="date" defaultValue={today()} required/></div><div className="field full"><label>Observações</label><textarea className="textarea" name="notes"/></div></div></form></ModalShell>;

    if (modal.type === 'settleInstallment') {
      const inst=modal.record,plan=modal.plan,accounts=accountsFor(c.id); const remaining=Math.max(0,inst.amount-inst.paidAmount); return <ModalShell title={`Pagar parcela ${inst.number}`} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="installment-form">Confirmar</button></>}><div className={styles.settlementSummary}><div><span>Parcela</span><strong>{money(inst.amount)}</strong></div><div><span>Pago</span><strong>{money(inst.paidAmount)}</strong></div><div><span>Restante</span><strong>{money(remaining)}</strong></div></div><form id="installment-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const result=await run(()=>settleInstallment({installment:inst,organizationId:c.id,planDescription:plan.description,amount:Number(f.get('amount')),date:String(f.get('date')),accountId:String(f.get('accountId')||'')||null}),'Parcela atualizada');if(result!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field"><label>Valor pago</label><input className="input" name="amount" type="number" min="0.01" max={remaining} step="0.01" defaultValue={remaining} required/></div><div className="field"><label>Data</label><input className="input" name="date" type="date" defaultValue={today()} required/></div><div className="field full"><label>Conta financeira</label><select className="select" name="accountId"><option value="">Não movimentar saldo</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div></div></form></ModalShell>;
    }

    if (modal.type === 'recurring') {
      const r=modal.record,receive=(r?.direction||'payable')==='receivable'; const cats=categoryRowsFor(c.id,receive?'revenue':'expense'); return <ModalShell title={r?'Editar item mensal':'Novo item mensal'} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="recurring-form">Salvar</button></>}><form id="recurring-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await run(()=>saveRecurringItem({id:r?.id,organizationId:c.id,direction:String(f.get('direction')),description:String(f.get('description')),counterparty:String(f.get('counterparty')||''),amount:Number(f.get('amount')),dayOfMonth:Number(f.get('dayOfMonth')),categoryId:String(f.get('categoryId')||'')||null,startDate:String(f.get('startDate')||today()),endDate:String(f.get('endDate')||'')||null,notes:String(f.get('notes')||'')}),'Item mensal salvo');if(id!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field"><label>Tipo</label><select className="select" name="direction" defaultValue={r?.direction||'payable'}><option value="payable">A pagar</option><option value="receivable">A receber</option></select></div><div className="field"><label>Dia do mês</label><input className="input" name="dayOfMonth" type="number" min="1" max="28" defaultValue={r?.dayOfMonth||10} required/></div><div className="field full"><label>Descrição</label><input className="input" name="description" defaultValue={r?.description||''} required/></div><div className="field"><label>Cliente / fornecedor</label><input className="input" name="counterparty" defaultValue={r?.counterparty||''}/></div><div className="field"><label>Valor</label><input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={r?.amount||''} required/></div><div className="field"><label>Categoria</label><select className="select" name="categoryId" defaultValue={r?.categoryId||''}><option value="">Sem categoria</option>{cats.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div className="field"><label>Início</label><input className="input" name="startDate" type="date" defaultValue={r?.startDate||today()}/></div><div className="field"><label>Fim opcional</label><input className="input" name="endDate" type="date" defaultValue={r?.endDate||''}/></div><div className="field full"><label>Observações</label><textarea className="textarea" name="notes" defaultValue={r?.notes||''}/></div></div></form></ModalShell>;
    }

    if (modal.type === 'budget') {
      const cats=[...categoryRowsFor(c.id,'revenue'),...categoryRowsFor(c.id,'expense')]; return <ModalShell title="Nova meta do mês" footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="budget-form">Salvar</button></>}><form id="budget-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const id=await run(()=>saveBudget({organizationId:c.id,month:state.month,type:String(f.get('type')),categoryId:String(f.get('categoryId')||'')||null,label:String(f.get('label')||''),plannedAmount:Number(f.get('plannedAmount'))}),'Meta salva');if(id!==null)setModal(null)}}><div className={styles.formGrid2}><div className="field"><label>Tipo</label><select className="select" name="type"><option value="expense">Limite de despesa</option><option value="revenue">Meta de receita</option></select></div><div className="field"><label>Valor planejado</label><input className="input" name="plannedAmount" type="number" min="0" step="0.01" required/></div><div className="field"><label>Categoria opcional</label><select className="select" name="categoryId"><option value="">Total do tipo</option>{cats.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div><div className="field"><label>Nome da meta</label><input className="input" name="label" placeholder="Ex.: Limite de marketing"/></div></div></form></ModalShell>;
    }

    if (modal.type === 'confirmMonth') {
      const hasRevenue=entriesFor(c.id,'revenue').length>0,hasExpense=entriesFor(c.id,'expense').length>0; return <ModalShell title={`Confirmar ${monthName(state.month)}`} footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" form="confirm-form">Confirmar e enviar</button></>}><div className={styles.modalHint}><b>Confirmação mensal:</b> revise as informações. Depois do envio, os lançamentos ficam bloqueados até uma reabertura.</div><form id="confirm-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const revenueNoMovement=Boolean(f.get('revenueNoMovement')),expenseNoMovement=Boolean(f.get('expenseNoMovement'));if(!hasRevenue&&!revenueNoMovement){setToast('Informe receitas ou marque sem movimento');return}if(c.expenseEnabled&&!hasExpense&&!expenseNoMovement){setToast('Informe despesas ou marque sem movimento');return}const result=await run(()=>confirmMonth({organizationId:c.id,month:state.month,revenueNoMovement,expenseNoMovement,settingsSnapshot:{revenueMode:c.revenueMode,expenseEnabled:c.expenseEnabled,expenseMode:c.expenseMode,financeModules:modulesFor(c)}}),'Mês confirmado e enviado');if(result!==null)setModal(null)}}>{!hasRevenue&&<label className={styles.checkboxRow}><input type="checkbox" name="revenueNoMovement"/><div><strong>Não houve receitas neste mês</strong><span>Declare sem movimento em vez de criar um lançamento de R$ 0.</span></div></label>}{c.expenseEnabled&&!hasExpense&&<label className={styles.checkboxRow}><input type="checkbox" name="expenseNoMovement"/><div><strong>Não houve despesas neste mês</strong><span>A declaração ficará registrada junto com o mês.</span></div></label>}<div className={styles.settlementSummary}><div><span>Receitas</span><strong>{money(summaryFor(c.id).revenue)}</strong></div>{c.expenseEnabled&&<div><span>Despesas</span><strong>{money(summaryFor(c.id).expenses)}</strong></div>}<div><span>Saldo do período</span><strong>{money(summaryFor(c.id).periodBalance)}</strong></div></div></form></ModalShell>;
    }
    return null;
  }

  let content;
  if (currentCompany) content = <Workspace c={currentCompany}/>;
  else if (state.masterView === 'clients') content = <MasterClients/>;
  else if (state.masterView === 'closings') content = <MasterClosings/>;
  else if (state.masterView === 'settings') content = <MasterSettings/>;
  else content = <MasterPortfolio/>;

  const title = currentCompany ? currentCompany.name : ({ portfolio:'Visão geral',clients:'Clientes',closings:'Fechamentos',settings:'Configurações' }[state.masterView] || 'Central Financeira');
  return <><div className="shell"><Sidebar/><main className="main"><header className="topbar"><div className="crumb">Central Financeira <span>›</span><strong>{title}</strong></div><div className="topright">{monthControl}<div className="avatar">{initials(user.name||'LG')}</div></div></header><div className={`content ${styles.contentPad}`}>{error&&<div className="notice" style={{marginTop:0,marginBottom:14,color:'var(--danger)',borderColor:'#F2C9C5'}}>{error}</div>}{content}</div></main></div>{Modal()}{toast&&<div className="toast">{toast}</div>}</>;
}

