'use client';

import { neonTest } from './neon-test-client';

export const COMPLETE_CONTROL_TIER = 'complete';
export const COMPLETE_ACCOUNT_KINDS = ['bank', 'cash', 'wallet', 'other'];
export const COMPLETE_OBLIGATION_DIRECTIONS = ['receivable', 'payable'];
export const COMPLETE_OBLIGATION_ORIGINS = ['manual', 'financial_entry', 'opening'];

const asNumber = value => Number(value || 0);
const clean = value => String(value ?? '').trim();
const monthDate = month => `${month}-01`;

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function normalizeCompleteError(error) {
  if (!error) return 'Erro desconhecido.';
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || JSON.stringify(error);
}

async function requireOk(result) {
  if (result?.error) throw result.error;
  return result?.data ?? result ?? null;
}

async function query(table, columns = '*') {
  const result = await neonTest.from(table).select(columns);
  if (result.error) throw result.error;
  return result.data || [];
}

async function rpc(name, args) {
  const result = await neonTest.rpc(name, args);
  if (result?.error) throw result.error;
  return result?.data ?? null;
}

export async function loadCompleteControlData(activeOrganizationId = null) {
  const orgResult = await neonTest.auth.organization.list();
  const organizations = await requireOk(orgResult) || [];

  const roleResult = await neonTest.from('app_users').select('system_role,active').limit(1);
  if (roleResult.error) throw roleResult.error;
  const appUser = roleResult.data?.[0] || { system_role: 'client_user', active: true };
  if (!appUser.active) throw new Error('Este acesso está desativado.');

  if (appUser.system_role !== 'super_admin' && organizations.length && !activeOrganizationId) {
    const activate = await neonTest.auth.organization.setActive({ organizationId: organizations[0].id });
    if (activate?.error) throw activate.error;
    return { reload: true };
  }

  const [settings, entriesRaw, accountsRaw, obligationsRaw, settlementsRaw, movementsRaw, transfersRaw, categories, customers, suppliers] = await Promise.all([
    query('organization_settings', 'organization_id,control_tier,control_start_month,revenue_mode,expense_mode,active,pending_control_tier,pending_control_tier_effective'),
    query('financial_entries', 'id,organization_id,competency,occurred_on,type,description,amount,mode,entry_status,customer_id,supplier_id,category_id,created_at,updated_at'),
    query('finance_accounts', 'id,organization_id,name,kind,institution,opening_balance,opening_date,active,created_at,updated_at'),
    query('finance_obligations', 'id,organization_id,direction,origin,financial_entry_id,customer_id,supplier_id,category_id,description,issue_date,due_date,original_amount,settled_amount,status,notes,cancelled_at,cancel_reason,created_at,updated_at'),
    query('finance_settlements', 'id,organization_id,obligation_id,account_id,settled_on,amount,notes,status,reversed_at,reverse_reason,created_at'),
    query('finance_cash_movements', 'id,organization_id,account_id,occurred_on,direction,amount,description,movement_kind,settlement_id,transfer_id,created_at'),
    query('finance_transfers', 'id,organization_id,from_account_id,to_account_id,transferred_on,amount,description,status,reversed_at,reverse_reason,created_at'),
    query('financial_categories', 'id,organization_id,type,name,active'),
    query('finance_customers', 'id,organization_id,name,document,active,merged_into,is_consumer_final'),
    query('finance_suppliers', 'id,organization_id,name,document,active,merged_into,is_unspecified')
  ]);

  const settingsByOrg = new Map(settings.map(row => [row.organization_id, row]));
  const movementTotals = new Map();
  for (const row of movementsRaw) {
    const current = movementTotals.get(row.account_id) || 0;
    const amount = asNumber(row.amount);
    movementTotals.set(row.account_id, current + (row.direction === 'in' ? amount : -amount));
  }

  const companies = organizations.map(org => {
    const cfg = settingsByOrg.get(org.id) || {};
    return {
      id: org.id,
      name: org.name,
      controlTier: cfg.control_tier || 'unconfigured',
      controlStartMonth: cfg.control_start_month ? String(cfg.control_start_month).slice(0, 7) : null,
      revenueMode: cfg.revenue_mode || 'monthly',
      expenseMode: cfg.expense_mode || 'monthly',
      pendingControlTier: cfg.pending_control_tier || null,
      pendingControlTierEffective: cfg.pending_control_tier_effective ? String(cfg.pending_control_tier_effective).slice(0, 7) : null,
      active: cfg.active !== false
    };
  }).filter(company => company.active);

  const entries = entriesRaw
    .filter(row => row.entry_status === 'active')
    .map(row => ({
      id: row.id,
      companyId: row.organization_id,
      month: String(row.competency).slice(0, 7),
      date: row.occurred_on || row.competency,
      type: row.type,
      description: row.description || (row.type === 'revenue' ? 'Receita' : 'Despesa'),
      amount: asNumber(row.amount),
      mode: row.mode,
      customerId: row.customer_id,
      supplierId: row.supplier_id,
      categoryId: row.category_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

  const accounts = accountsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    name: row.name,
    kind: row.kind,
    institution: row.institution || '',
    openingBalance: asNumber(row.opening_balance),
    openingDate: row.opening_date,
    balance: asNumber(row.opening_balance) + (movementTotals.get(row.id) || 0),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  const today = localToday();
  const obligations = obligationsRaw.map(row => {
    const originalAmount = asNumber(row.original_amount);
    const settledAmount = asNumber(row.settled_amount);
    const remaining = Math.max(0, originalAmount - settledAmount);
    const isOverdue = ['open', 'partial'].includes(row.status) && row.due_date && String(row.due_date).slice(0, 10) < today;
    return {
      id: row.id,
      companyId: row.organization_id,
      direction: row.direction,
      origin: row.origin,
      financialEntryId: row.financial_entry_id,
      customerId: row.customer_id,
      supplierId: row.supplier_id,
      categoryId: row.category_id,
      description: row.description,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      originalAmount,
      settledAmount,
      remaining,
      status: row.status,
      displayStatus: isOverdue ? 'overdue' : row.status,
      overdue: isOverdue,
      notes: row.notes || '',
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });

  const settlements = settlementsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    obligationId: row.obligation_id,
    accountId: row.account_id,
    date: row.settled_on,
    amount: asNumber(row.amount),
    notes: row.notes || '',
    status: row.status,
    reversedAt: row.reversed_at,
    reverseReason: row.reverse_reason || '',
    createdAt: row.created_at
  }));

  const movements = movementsRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    accountId: row.account_id,
    date: row.occurred_on,
    direction: row.direction,
    amount: asNumber(row.amount),
    description: row.description,
    kind: row.movement_kind,
    settlementId: row.settlement_id,
    transferId: row.transfer_id,
    createdAt: row.created_at
  }));

  const transfers = transfersRaw.map(row => ({
    id: row.id,
    companyId: row.organization_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    date: row.transferred_on,
    amount: asNumber(row.amount),
    description: row.description,
    status: row.status,
    reversedAt: row.reversed_at,
    reverseReason: row.reverse_reason || '',
    createdAt: row.created_at
  }));

  return {
    reload: false,
    systemRole: appUser.system_role,
    companies,
    entries,
    accounts,
    obligations,
    settlements,
    movements,
    transfers,
    categories,
    customers,
    suppliers,
    currentDate: today
  };
}

export async function configureCompleteControl({ organizationId, startMonth, revenueMode = 'monthly', expenseMode = 'monthly' }) {
  const result = await neonTest.from('organization_settings').update({
    control_tier: COMPLETE_CONTROL_TIER,
    control_start_month: monthDate(startMonth),
    revenue_mode: revenueMode,
    expense_enabled: true,
    expense_mode: expenseMode,
    pending_control_tier: null,
    pending_control_tier_effective: null,
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId);
  if (result.error) throw result.error;
}

export async function createCompleteAccount({ organizationId, name, kind = 'bank', institution = '', openingBalance = 0, openingDate }) {
  return rpc('create_finance_account', {
    p_organization_id: organizationId,
    p_name: clean(name),
    p_kind: kind,
    p_institution: clean(institution) || null,
    p_opening_balance: asNumber(openingBalance),
    p_opening_date: openingDate
  });
}

export async function updateCompleteAccount({ accountId, name, kind = 'bank', institution = '', active = true }) {
  return rpc('update_finance_account', {
    p_account_id: accountId,
    p_name: clean(name),
    p_kind: kind,
    p_institution: clean(institution) || null,
    p_active: Boolean(active)
  });
}

export async function createCompleteObligation({
  organizationId,
  direction,
  origin = 'manual',
  financialEntryId = null,
  customerId = null,
  supplierId = null,
  categoryId = null,
  description,
  issueDate = null,
  dueDate,
  amount,
  notes = ''
}) {
  return rpc('create_finance_obligation', {
    p_organization_id: organizationId,
    p_direction: direction,
    p_origin: origin,
    p_financial_entry_id: financialEntryId,
    p_customer_id: customerId,
    p_supplier_id: supplierId,
    p_category_id: categoryId,
    p_description: clean(description) || null,
    p_issue_date: issueDate || null,
    p_due_date: dueDate,
    p_amount: asNumber(amount),
    p_notes: clean(notes)
  });
}

export async function settleCompleteObligation({ obligationId, accountId, date, amount, notes = '' }) {
  return rpc('settle_finance_obligation', {
    p_obligation_id: obligationId,
    p_account_id: accountId,
    p_settled_on: date,
    p_amount: asNumber(amount),
    p_notes: clean(notes)
  });
}

export async function reverseCompleteSettlement({ settlementId, date, reason }) {
  return rpc('reverse_finance_settlement', {
    p_settlement_id: settlementId,
    p_reversed_on: date,
    p_reason: clean(reason)
  });
}

export async function cancelCompleteObligation({ obligationId, reason }) {
  return rpc('cancel_finance_obligation', {
    p_obligation_id: obligationId,
    p_reason: clean(reason)
  });
}

export async function createCompleteTransfer({ organizationId, fromAccountId, toAccountId, date, amount, description = '' }) {
  return rpc('create_finance_transfer', {
    p_organization_id: organizationId,
    p_from_account_id: fromAccountId,
    p_to_account_id: toAccountId,
    p_transferred_on: date,
    p_amount: asNumber(amount),
    p_description: clean(description) || 'Transferência entre contas'
  });
}

export async function reverseCompleteTransfer({ transferId, date, reason }) {
  return rpc('reverse_finance_transfer', {
    p_transfer_id: transferId,
    p_reversed_on: date,
    p_reason: clean(reason)
  });
}
