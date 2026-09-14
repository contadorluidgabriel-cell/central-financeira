'use client';

import { neonTest } from './neon-test-client';
import {
  createCompany as createBaseCompany,
  loadCentralData,
  normalizeError,
  unwrap
} from './neon-live-data';

export { normalizeError };

export const DEFAULT_FINANCE_MODULES = {
  expenses: true,
  receivables: true,
  payables: true,
  accounts: true,
  installments: false,
  recurring: false,
  cashflow: true,
  budgets: false
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const competencyDate = month => `${month}-01`;

async function requireOk(result) {
  if (result?.error) throw result.error;
  return unwrap(result);
}

async function query(table, columns = '*') {
  const result = await neonTest.from(table).select(columns);
  if (result.error) throw result.error;
  return result.data || [];
}

function asNumber(value) {
  return Number(value || 0);
}

function profileFor(profiles, organizationId) {
  const row = profiles.find(item => item.organization_id === organizationId);
  return {
    organizationId,
    modules: { ...DEFAULT_FINANCE_MODULES, ...(row?.modules || {}) },
    dashboardMode: row?.dashboard_mode || 'financial',
    defaultProjectionDays: Number(row?.default_projection_days || 30)
  };
}

function dynamicStatus(status, dueDate, settled) {
  if (['received', 'paid', 'cancelled'].includes(status)) return status;
  if (settled) return status;
  return dueDate && dueDate < isoToday() ? 'overdue' : status;
}

export async function loadFinanceV2Data(activeOrganizationId = null) {
  const base = await loadCentralData(activeOrganizationId);
  if (base.reload) return base;

  const [profiles, accountsRaw, movementsRaw, receivablesRaw, payablesRaw, plansRaw, installmentsRaw, recurringRaw, budgetsRaw] = await Promise.all([
    query('finance_profiles', 'organization_id,modules,dashboard_mode,default_projection_days'),
    query('financial_accounts', 'id,organization_id,name,type,opening_balance,active,created_at,updated_at'),
    query('account_movements', 'id,organization_id,account_id,occurred_on,direction,amount,description,source_type,source_id,transfer_group_id,created_at'),
    query('receivables', 'id,organization_id,customer,description,category_id,amount,received_amount,issue_date,due_date,received_at,status,account_id,notes,recurring_item_id,created_at,updated_at'),
    query('payables', 'id,organization_id,supplier,description,category_id,amount,paid_amount,issue_date,due_date,paid_at,status,account_id,notes,recurring_item_id,created_at,updated_at'),
    query('installment_plans', 'id,organization_id,type,description,creditor,total_amount,installments_count,installment_amount,first_due_date,active,notes,created_at,updated_at'),
    query('installments', 'id,organization_id,plan_id,installment_number,due_date,amount,paid_amount,paid_at,status,account_id,created_at,updated_at'),
    query('recurring_items', 'id,organization_id,direction,description,counterparty,amount,day_of_month,category_id,start_date,end_date,active,notes,created_at,updated_at'),
    query('monthly_budgets', 'id,organization_id,competency,type,category_id,label,planned_amount,created_at,updated_at')
  ]);

  const movementsByAccount = new Map();
  for (const row of movementsRaw) {
    const current = movementsByAccount.get(row.account_id) || 0;
    const amount = asNumber(row.amount);
    movementsByAccount.set(row.account_id, current + (row.direction === 'in' ? amount : -amount));
  }

  const accounts = accountsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    name: row.name,
    type: row.type,
    openingBalance: asNumber(row.opening_balance),
    balance: asNumber(row.opening_balance) + (movementsByAccount.get(row.id) || 0),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const movements = movementsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    accountId: row.account_id,
    date: row.occurred_on,
    direction: row.direction,
    amount: asNumber(row.amount),
    description: row.description,
    sourceType: row.source_type,
    sourceId: row.source_id,
    transferGroupId: row.transfer_group_id,
    createdAt: row.created_at
  }));

  const receivables = receivablesRaw.map(row => {
    const amount = asNumber(row.amount);
    const receivedAmount = asNumber(row.received_amount);
    return {
      id: row.id,
      companyId: row.organization_id,
      customer: row.customer,
      description: row.description,
      categoryId: row.category_id,
      amount,
      receivedAmount,
      remaining: Math.max(0, amount - receivedAmount),
      issueDate: row.issue_date,
      dueDate: row.due_date,
      receivedAt: row.received_at,
      status: dynamicStatus(row.status, row.due_date, receivedAmount >= amount && amount > 0),
      accountId: row.account_id,
      notes: row.notes,
      recurringItemId: row.recurring_item_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });

  const payables = payablesRaw.map(row => {
    const amount = asNumber(row.amount);
    const paidAmount = asNumber(row.paid_amount);
    return {
      id: row.id,
      companyId: row.organization_id,
      supplier: row.supplier,
      description: row.description,
      categoryId: row.category_id,
      amount,
      paidAmount,
      remaining: Math.max(0, amount - paidAmount),
      issueDate: row.issue_date,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      status: dynamicStatus(row.status, row.due_date, paidAmount >= amount && amount > 0),
      accountId: row.account_id,
      notes: row.notes,
      recurringItemId: row.recurring_item_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });

  const installmentPlans = plansRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    type: row.type,
    description: row.description,
    creditor: row.creditor,
    totalAmount: asNumber(row.total_amount),
    installmentsCount: Number(row.installments_count || 0),
    installmentAmount: asNumber(row.installment_amount),
    firstDueDate: row.first_due_date,
    active: row.active,
    notes: row.notes
  }));

  const installments = installmentsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    planId: row.plan_id,
    number: Number(row.installment_number || 0),
    dueDate: row.due_date,
    amount: asNumber(row.amount),
    paidAmount: asNumber(row.paid_amount),
    status: dynamicStatus(row.status, row.due_date, asNumber(row.paid_amount) >= asNumber(row.amount) && asNumber(row.amount) > 0),
    paidAt: row.paid_at,
    accountId: row.account_id
  }));

  const recurringItems = recurringRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    direction: row.direction,
    description: row.description,
    counterparty: row.counterparty,
    amount: asNumber(row.amount),
    dayOfMonth: Number(row.day_of_month || 1),
    categoryId: row.category_id,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
    notes: row.notes
  }));

  const budgets = budgetsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    month: String(row.competency).slice(0, 7),
    type: row.type,
    categoryId: row.category_id,
    label: row.label,
    plannedAmount: asNumber(row.planned_amount)
  }));

  return {
    ...base,
    profiles: base.companies.map(company => profileFor(profiles, company.id)),
    accounts,
    movements,
    receivables,
    payables,
    installmentPlans,
    installments,
    recurringItems,
    budgets
  };
}

export async function createCompanyV2({ name, document, contact }) {
  const organizationId = await createBaseCompany({
    name,
    document,
    contact,
    revenueMode: 'monthly',
    expenseEnabled: false
  });

  const settings = await neonTest.from('organization_settings').update({
    control_tier: 'unconfigured',
    control_start_month: null,
    pending_revenue_mode: null,
    pending_revenue_mode_effective: null,
    expense_enabled: false,
    expense_mode: 'category',
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId);
  if (settings.error) throw settings.error;

  const initialModules = Object.fromEntries(
    Object.keys(DEFAULT_FINANCE_MODULES).map(key => [key, false])
  );
  const profile = await neonTest.from('finance_profiles').insert({
    organization_id: organizationId,
    modules: initialModules,
    dashboard_mode: 'financial',
    default_projection_days: 30
  });
  if (profile.error) throw profile.error;
  return organizationId;
}

export async function saveFinanceProfile(organizationId, { modules, dashboardMode, defaultProjectionDays }) {
  const payload = { updated_at: new Date().toISOString() };
  if (modules) payload.modules = modules;
  if (dashboardMode) payload.dashboard_mode = dashboardMode;
  if (defaultProjectionDays) payload.default_projection_days = Number(defaultProjectionDays);

  const updated = await neonTest.from('finance_profiles').update(payload).eq('organization_id', organizationId).select('organization_id');
  if (updated.error) throw updated.error;
  if (updated.data?.length) return;

  const inserted = await neonTest.from('finance_profiles').insert({
    organization_id: organizationId,
    modules: modules || DEFAULT_FINANCE_MODULES,
    dashboard_mode: dashboardMode || 'financial',
    default_projection_days: Number(defaultProjectionDays || 30)
  });
  if (inserted.error) throw inserted.error;
}

export async function saveAccount({ id, organizationId, name, type, openingBalance, active = true }) {
  const payload = {
    organization_id: organizationId,
    name: String(name || '').trim(),
    type: type || 'bank',
    opening_balance: asNumber(openingBalance),
    active: Boolean(active),
    updated_at: new Date().toISOString()
  };
  if (id) {
    const result = await neonTest.from('financial_accounts').update(payload).eq('id', id);
    if (result.error) throw result.error;
    return id;
  }
  const result = await neonTest.from('financial_accounts').insert(payload).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function deactivateAccount(id) {
  const result = await neonTest.from('financial_accounts').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (result.error) throw result.error;
}

export async function saveManualMovement({ organizationId, accountId, date, direction, amount, description }) {
  const result = await neonTest.from('account_movements').insert({
    organization_id: organizationId,
    account_id: accountId,
    occurred_on: date,
    direction,
    amount: asNumber(amount),
    description: String(description || '').trim(),
    source_type: 'manual'
  }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function saveTransfer({ organizationId, fromAccountId, toAccountId, date, amount, description }) {
  if (fromAccountId === toAccountId) throw new Error('Escolha contas diferentes para a transferência.');
  const transferGroupId = crypto.randomUUID();
  const rows = [
    { organization_id: organizationId, account_id: fromAccountId, occurred_on: date, direction: 'out', amount: asNumber(amount), description: description || 'Transferência entre contas', source_type: 'transfer', transfer_group_id: transferGroupId },
    { organization_id: organizationId, account_id: toAccountId, occurred_on: date, direction: 'in', amount: asNumber(amount), description: description || 'Transferência entre contas', source_type: 'transfer', transfer_group_id: transferGroupId }
  ];
  const result = await neonTest.from('account_movements').insert(rows);
  if (result.error) throw result.error;
  return transferGroupId;
}

export async function saveReceivable({ id, organizationId, customer, description, categoryId, amount, issueDate, dueDate, notes }) {
  const payload = {
    organization_id: organizationId,
    customer: String(customer || '').trim(),
    description: String(description || '').trim(),
    category_id: categoryId || null,
    amount: asNumber(amount),
    issue_date: issueDate || null,
    due_date: dueDate,
    notes: String(notes || '').trim(),
    updated_at: new Date().toISOString()
  };
  if (id) {
    const result = await neonTest.from('receivables').update(payload).eq('id', id);
    if (result.error) throw result.error;
    return id;
  }
  const result = await neonTest.from('receivables').insert({ ...payload, received_amount: 0, status: 'pending' }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function cancelReceivable(id) {
  const result = await neonTest.from('receivables').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
  if (result.error) throw result.error;
}

export async function settleReceivable({ record, amount, date, accountId }) {
  const settlement = asNumber(amount);
  if (settlement <= 0) throw new Error('Informe um valor recebido maior que zero.');
  const totalReceived = Math.min(record.amount, asNumber(record.receivedAmount) + settlement);
  const applied = totalReceived - asNumber(record.receivedAmount);
  const status = totalReceived >= record.amount ? 'received' : 'partial';
  const updated = await neonTest.from('receivables').update({
    received_amount: totalReceived,
    received_at: date,
    account_id: accountId || null,
    status,
    updated_at: new Date().toISOString()
  }).eq('id', record.id);
  if (updated.error) throw updated.error;
  if (accountId && applied > 0) {
    const movement = await neonTest.from('account_movements').insert({
      organization_id: record.companyId,
      account_id: accountId,
      occurred_on: date,
      direction: 'in',
      amount: applied,
      description: `Recebimento • ${record.description}`,
      source_type: 'receivable',
      source_id: record.id
    });
    if (movement.error) throw movement.error;
  }
}

export async function savePayable({ id, organizationId, supplier, description, categoryId, amount, issueDate, dueDate, notes }) {
  const payload = {
    organization_id: organizationId,
    supplier: String(supplier || '').trim(),
    description: String(description || '').trim(),
    category_id: categoryId || null,
    amount: asNumber(amount),
    issue_date: issueDate || null,
    due_date: dueDate,
    notes: String(notes || '').trim(),
    updated_at: new Date().toISOString()
  };
  if (id) {
    const result = await neonTest.from('payables').update(payload).eq('id', id);
    if (result.error) throw result.error;
    return id;
  }
  const result = await neonTest.from('payables').insert({ ...payload, paid_amount: 0, status: 'pending' }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function cancelPayable(id) {
  const result = await neonTest.from('payables').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
  if (result.error) throw result.error;
}

export async function settlePayable({ record, amount, date, accountId }) {
  const settlement = asNumber(amount);
  if (settlement <= 0) throw new Error('Informe um valor pago maior que zero.');
  const totalPaid = Math.min(record.amount, asNumber(record.paidAmount) + settlement);
  const applied = totalPaid - asNumber(record.paidAmount);
  const status = totalPaid >= record.amount ? 'paid' : 'partial';
  const updated = await neonTest.from('payables').update({
    paid_amount: totalPaid,
    paid_at: date,
    account_id: accountId || null,
    status,
    updated_at: new Date().toISOString()
  }).eq('id', record.id);
  if (updated.error) throw updated.error;
  if (accountId && applied > 0) {
    const movement = await neonTest.from('account_movements').insert({
      organization_id: record.companyId,
      account_id: accountId,
      occurred_on: date,
      direction: 'out',
      amount: applied,
      description: `Pagamento • ${record.description}`,
      source_type: 'payable',
      source_id: record.id
    });
    if (movement.error) throw movement.error;
  }
}

function addMonthsClamped(dateString, months) {
  const [year, month, day] = dateString.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = first.getUTCFullYear();
  const targetMonth = first.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export async function createInstallmentPlan({ organizationId, type, description, creditor, totalAmount, installmentsCount, installmentAmount, firstDueDate, notes }) {
  const planResult = await neonTest.from('installment_plans').insert({
    organization_id: organizationId,
    type: type || 'financing',
    description: String(description || '').trim(),
    creditor: String(creditor || '').trim(),
    total_amount: asNumber(totalAmount),
    installments_count: Number(installmentsCount),
    installment_amount: asNumber(installmentAmount),
    first_due_date: firstDueDate,
    notes: String(notes || '').trim(),
    active: true
  }).select('id');
  if (planResult.error) throw planResult.error;
  const planId = planResult.data?.[0]?.id;
  if (!planId) throw new Error('Não foi possível criar o parcelamento.');

  const rows = Array.from({ length: Number(installmentsCount) }, (_, index) => ({
    organization_id: organizationId,
    plan_id: planId,
    installment_number: index + 1,
    due_date: addMonthsClamped(firstDueDate, index),
    amount: asNumber(installmentAmount),
    paid_amount: 0,
    status: 'pending'
  }));
  const installmentsResult = await neonTest.from('installments').insert(rows);
  if (installmentsResult.error) throw installmentsResult.error;
  return planId;
}

export async function settleInstallment({ installment, organizationId, planDescription, amount, date, accountId }) {
  const settlement = asNumber(amount);
  const totalPaid = Math.min(installment.amount, asNumber(installment.paidAmount) + settlement);
  const applied = totalPaid - asNumber(installment.paidAmount);
  const status = totalPaid >= installment.amount ? 'paid' : 'partial';
  const updated = await neonTest.from('installments').update({
    paid_amount: totalPaid,
    paid_at: date,
    account_id: accountId || null,
    status,
    updated_at: new Date().toISOString()
  }).eq('id', installment.id);
  if (updated.error) throw updated.error;
  if (accountId && applied > 0) {
    const movement = await neonTest.from('account_movements').insert({
      organization_id: organizationId,
      account_id: accountId,
      occurred_on: date,
      direction: 'out',
      amount: applied,
      description: `Parcela ${installment.number} • ${planDescription}`,
      source_type: 'installment',
      source_id: installment.id
    });
    if (movement.error) throw movement.error;
  }
}

export async function saveRecurringItem({ id, organizationId, direction, description, counterparty, amount, dayOfMonth, categoryId, startDate, endDate, notes, active = true }) {
  const payload = {
    organization_id: organizationId,
    direction,
    description: String(description || '').trim(),
    counterparty: String(counterparty || '').trim(),
    amount: asNumber(amount),
    day_of_month: Number(dayOfMonth),
    category_id: categoryId || null,
    start_date: startDate || isoToday(),
    end_date: endDate || null,
    notes: String(notes || '').trim(),
    active: Boolean(active),
    updated_at: new Date().toISOString()
  };
  if (id) {
    const result = await neonTest.from('recurring_items').update(payload).eq('id', id);
    if (result.error) throw result.error;
    return id;
  }
  const result = await neonTest.from('recurring_items').insert(payload).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function deactivateRecurringItem(id) {
  const result = await neonTest.from('recurring_items').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (result.error) throw result.error;
}

export async function generateRecurringMonth({ organizationId, month, items }) {
  const created = [];
  for (const item of items.filter(row => row.companyId === organizationId && row.active)) {
    const dueDate = `${month}-${String(item.dayOfMonth).padStart(2, '0')}`;
    if (item.startDate && dueDate < item.startDate) continue;
    if (item.endDate && dueDate > item.endDate) continue;
    const table = item.direction === 'receivable' ? 'receivables' : 'payables';
    const existing = await neonTest.from(table).select('id').eq('recurring_item_id', item.id).eq('due_date', dueDate).limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.length) continue;
    const payload = item.direction === 'receivable'
      ? { organization_id: organizationId, customer: item.counterparty, description: item.description, category_id: item.categoryId || null, amount: item.amount, received_amount: 0, due_date: dueDate, status: 'pending', recurring_item_id: item.id, notes: item.notes || '' }
      : { organization_id: organizationId, supplier: item.counterparty, description: item.description, category_id: item.categoryId || null, amount: item.amount, paid_amount: 0, due_date: dueDate, status: 'pending', recurring_item_id: item.id, notes: item.notes || '' };
    const result = await neonTest.from(table).insert(payload).select('id');
    if (result.error) throw result.error;
    created.push(result.data?.[0]?.id);
  }
  return created.filter(Boolean);
}

export async function saveBudget({ id, organizationId, month, type, categoryId, label, plannedAmount }) {
  const payload = {
    organization_id: organizationId,
    competency: competencyDate(month),
    type,
    category_id: categoryId || null,
    label: String(label || '').trim(),
    planned_amount: asNumber(plannedAmount),
    updated_at: new Date().toISOString()
  };
  if (id) {
    const result = await neonTest.from('monthly_budgets').update(payload).eq('id', id);
    if (result.error) throw result.error;
    return id;
  }
  const result = await neonTest.from('monthly_budgets').insert(payload).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function deleteBudget(id) {
  const result = await neonTest.from('monthly_budgets').delete().eq('id', id);
  if (result.error) throw result.error;
}
