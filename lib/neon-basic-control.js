'use client';

import { neonTest } from './neon-test-client';
import { bootstrapSimpleOrganization, SIMPLE_MODES } from './neon-simple-control';

export const BASIC_CONTROL_TIER = 'basic';
export const BASIC_EXPENSE_MODES = ['monthly', 'individual'];
export const DEFAULT_BASIC_EXPENSE_CATEGORIES = [
  'Mercadorias e insumos',
  'Aluguel',
  'Energia elétrica',
  'Água',
  'Internet e telefone',
  'Folha e pessoal',
  'Pró-labore',
  'Serviços de terceiros',
  'Marketing',
  'Fretes e entregas',
  'Manutenção',
  'Combustível e transporte',
  'Taxas bancárias',
  'Impostos e taxas',
  'Material de escritório',
  'Software e assinaturas',
  'Outras despesas'
];

const competencyDate = month => `${month}-01`;
const normalizeText = value => String(value || '').trim();
const normalizeKey = value => normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const digits = value => normalizeText(value).replace(/\D/g, '');

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

async function query(table, columns = '*') {
  const result = await neonTest.from(table).select(columns);
  if (result.error) throw result.error;
  return result.data || [];
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonth(key) {
  let [year, month] = String(key).split('-').map(Number);
  month -= 1;
  if (month === 0) { month = 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function nextMonth(key) {
  let [year, month] = String(key).split('-').map(Number);
  month += 1;
  if (month === 13) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function normalizeBasicError(error) {
  if (!error) return 'Erro desconhecido.';
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || JSON.stringify(error);
}

export async function loadBasicControlData(activeOrganizationId = null) {
  const orgResult = await neonTest.auth.organization.list();
  if (orgResult?.error) throw orgResult.error;
  const organizations = orgResult?.data || [];

  const roleResult = await neonTest.from('app_users').select('system_role,active').limit(1);
  if (roleResult.error) throw roleResult.error;
  const appUser = roleResult.data?.[0] || { system_role: 'client_user', active: true };
  if (!appUser.active) throw new Error('Este acesso está desativado.');

  if (appUser.system_role !== 'super_admin' && organizations.length && !activeOrganizationId) {
    const activate = await neonTest.auth.organization.setActive({ organizationId: organizations[0].id });
    if (activate?.error) throw activate.error;
    return { reload: true };
  }

  const [settings, categories, customers, suppliers, paymentMethods, entries, submissions, notifications] = await Promise.all([
    query('organization_settings', 'organization_id,revenue_mode,expense_enabled,expense_mode,control_tier,control_start_month,pending_control_tier,pending_control_tier_effective,pending_revenue_mode,pending_revenue_mode_effective,pending_expense_mode,pending_expense_mode_effective,active'),
    query('financial_categories', 'id,organization_id,type,name,is_default,active,created_at,updated_at'),
    query('finance_customers', 'id,organization_id,customer_number,code,external_code,name,document,phone,email,notes,is_consumer_final,active,merged_into,created_at,updated_at'),
    query('finance_suppliers', 'id,organization_id,supplier_number,code,external_code,name,document,phone,email,notes,is_unspecified,active,merged_into,created_at,updated_at'),
    query('finance_payment_methods', 'id,organization_id,name,is_default,active,created_at,updated_at'),
    query('financial_entries', 'id,organization_id,competency,occurred_on,type,description,category_id,amount,mode,customer_id,supplier_id,payment_method_id,entry_status,cancelled_at,cancel_reason,adjustment_kind,source_entry_id,created_at,updated_at'),
    query('monthly_submissions', 'organization_id,competency,status,revenue_no_movement,expense_no_movement,settings_snapshot,confirmed_by,confirmed_at,reopened_by,reopened_at,reopen_reason,reopen_count,updated_at'),
    appUser.system_role === 'super_admin'
      ? query('simple_control_notifications', 'id,organization_id,actor_user_id,notification_type,competency,title,message,metadata,read_at,created_at')
      : Promise.resolve([])
  ]);

  const settingsByOrg = new Map(settings.map(row => [row.organization_id, row]));
  const categoryById = new Map(categories.map(row => [row.id, row]));
  const customerById = new Map(customers.map(row => [row.id, row]));
  const supplierById = new Map(suppliers.map(row => [row.id, row]));
  const paymentById = new Map(paymentMethods.map(row => [row.id, row]));

  const companies = organizations.map(org => {
    const cfg = settingsByOrg.get(org.id) || {};
    const metadata = parseMetadata(org.metadata);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      document: metadata.document || '',
      contact: metadata.contact || '',
      metadata,
      controlTier: cfg.control_tier || 'unconfigured',
      controlStartMonth: cfg.control_start_month ? String(cfg.control_start_month).slice(0, 7) : null,
      revenueMode: cfg.revenue_mode || 'monthly',
      expenseEnabled: cfg.expense_enabled !== false,
      expenseMode: BASIC_EXPENSE_MODES.includes(cfg.expense_mode) ? cfg.expense_mode : 'monthly',
      pendingControlTier: cfg.pending_control_tier || null,
      pendingControlTierEffective: cfg.pending_control_tier_effective ? String(cfg.pending_control_tier_effective).slice(0, 7) : null,
      pendingRevenueMode: cfg.pending_revenue_mode || null,
      pendingRevenueModeEffective: cfg.pending_revenue_mode_effective ? String(cfg.pending_revenue_mode_effective).slice(0, 7) : null,
      pendingExpenseMode: cfg.pending_expense_mode || null,
      pendingExpenseModeEffective: cfg.pending_expense_mode_effective ? String(cfg.pending_expense_mode_effective).slice(0, 7) : null,
      active: cfg.active !== false
    };
  }).filter(company => company.active);

  const mappedEntries = entries.map(row => ({
    ...row,
    companyId: row.organization_id,
    month: String(row.competency).slice(0, 7),
    date: row.occurred_on || row.competency,
    category: row.category_id ? categoryById.get(row.category_id) || null : null,
    customer: row.customer_id ? customerById.get(row.customer_id) || null : null,
    supplier: row.supplier_id ? supplierById.get(row.supplier_id) || null : null,
    paymentMethod: row.payment_method_id ? paymentById.get(row.payment_method_id) || null : null,
    amount: Number(row.amount || 0)
  }));

  return {
    reload: false,
    systemRole: appUser.system_role,
    companies,
    categories,
    customers,
    suppliers,
    paymentMethods,
    entries: mappedEntries,
    submissions: submissions.map(row => ({
      ...row,
      companyId: row.organization_id,
      month: String(row.competency).slice(0, 7),
      revenueNoMovement: Boolean(row.revenue_no_movement),
      expenseNoMovement: Boolean(row.expense_no_movement),
      reopenCount: Number(row.reopen_count || 0)
    })),
    notifications: [...notifications].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    currentMonth: monthKey()
  };
}

export async function bootstrapBasicOrganization(organizationId) {
  await bootstrapSimpleOrganization(organizationId);
  const [categoryResult, supplierResult] = await Promise.all([
    neonTest.from('financial_categories').select('id,name,active').eq('organization_id', organizationId).eq('type', 'expense'),
    neonTest.from('finance_suppliers').select('id,is_unspecified,active').eq('organization_id', organizationId)
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (supplierResult.error) throw supplierResult.error;

  const names = new Set((categoryResult.data || []).map(row => normalizeKey(row.name)));
  const missing = DEFAULT_BASIC_EXPENSE_CATEGORIES
    .filter(name => !names.has(normalizeKey(name)))
    .map(name => ({ organization_id: organizationId, type: 'expense', name, is_default: true, active: true }));
  if (missing.length) {
    const result = await neonTest.from('financial_categories').insert(missing);
    if (result.error) throw result.error;
  }

  const hasUnspecified = (supplierResult.data || []).some(row => row.is_unspecified);
  if (!hasUnspecified) {
    const result = await neonTest.from('finance_suppliers').insert({
      organization_id: organizationId,
      name: 'Fornecedor não informado',
      is_unspecified: true,
      active: true
    });
    if (result.error) throw result.error;
  }
}

export async function updateBasicSettings(organizationId, patch) {
  const payload = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(patch, 'controlTier')) payload.control_tier = patch.controlTier;
  if (Object.prototype.hasOwnProperty.call(patch, 'controlStartMonth')) payload.control_start_month = patch.controlStartMonth ? competencyDate(patch.controlStartMonth) : null;
  if (Object.prototype.hasOwnProperty.call(patch, 'revenueMode')) payload.revenue_mode = patch.revenueMode;
  if (Object.prototype.hasOwnProperty.call(patch, 'expenseEnabled')) payload.expense_enabled = Boolean(patch.expenseEnabled);
  if (Object.prototype.hasOwnProperty.call(patch, 'expenseMode')) payload.expense_mode = patch.expenseMode;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingControlTier')) payload.pending_control_tier = patch.pendingControlTier || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingControlTierEffective')) payload.pending_control_tier_effective = patch.pendingControlTierEffective ? competencyDate(patch.pendingControlTierEffective) : null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueMode')) payload.pending_revenue_mode = patch.pendingRevenueMode || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueModeEffective')) payload.pending_revenue_mode_effective = patch.pendingRevenueModeEffective ? competencyDate(patch.pendingRevenueModeEffective) : null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingExpenseMode')) payload.pending_expense_mode = patch.pendingExpenseMode || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingExpenseModeEffective')) payload.pending_expense_mode_effective = patch.pendingExpenseModeEffective ? competencyDate(patch.pendingExpenseModeEffective) : null;
  const result = await neonTest.from('organization_settings').update(payload).eq('organization_id', organizationId);
  if (result.error) throw result.error;
}

export async function scheduleBasicRevenueMode(organizationId, mode, effectiveMonth) {
  if (!SIMPLE_MODES.includes(mode)) throw new Error('Modo de faturamento inválido.');
  await updateBasicSettings(organizationId, { pendingRevenueMode: mode, pendingRevenueModeEffective: effectiveMonth });
}

export async function scheduleExpenseMode(organizationId, mode, effectiveMonth) {
  if (!BASIC_EXPENSE_MODES.includes(mode)) throw new Error('Modo de despesas inválido.');
  await updateBasicSettings(organizationId, { pendingExpenseMode: mode, pendingExpenseModeEffective: effectiveMonth });
}

export async function scheduleControlTier(organizationId, tier, effectiveMonth) {
  if (!['simple', 'basic'].includes(tier)) throw new Error('Nível de controle inválido.');
  await updateBasicSettings(organizationId, { pendingControlTier: tier, pendingControlTierEffective: effectiveMonth });
}

export async function saveBasicSupplier({ organizationId, existingId = null, name, document = '', phone = '', email = '', notes = '', externalCode = '' }) {
  const payload = {
    organization_id: organizationId,
    name: normalizeText(name),
    document: normalizeText(document) || null,
    phone: normalizeText(phone) || null,
    email: normalizeText(email) || null,
    notes: normalizeText(notes) || null,
    external_code: normalizeText(externalCode) || null,
    updated_at: new Date().toISOString()
  };
  if (!payload.name) throw new Error('Informe o nome do fornecedor.');
  if (existingId) {
    const result = await neonTest.from('finance_suppliers').update(payload).eq('id', existingId).eq('is_unspecified', false);
    if (result.error) throw result.error;
    return existingId;
  }
  const result = await neonTest.from('finance_suppliers').insert({ ...payload, active: true }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function setBasicSupplierActive(supplierId, active) {
  const result = await neonTest.from('finance_suppliers').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', supplierId).eq('is_unspecified', false);
  if (result.error) throw result.error;
}

export async function deleteUnusedBasicSupplier(supplierId) {
  const used = await neonTest.from('financial_entries').select('id').eq('supplier_id', supplierId).limit(1);
  if (used.error) throw used.error;
  if (used.data?.length) throw new Error('Este fornecedor já possui despesas. Inative o cadastro em vez de excluir.');
  const result = await neonTest.from('finance_suppliers').delete().eq('id', supplierId).eq('is_unspecified', false);
  if (result.error) throw result.error;
}

export async function mergeBasicSuppliers({ organizationId, sourceId, targetId }) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error('Selecione dois fornecedores diferentes.');
  const move = await neonTest.from('financial_entries').update({ supplier_id: targetId, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('supplier_id', sourceId);
  if (move.error) throw move.error;
  const source = await neonTest.from('finance_suppliers').update({ active: false, merged_into: targetId, updated_at: new Date().toISOString() }).eq('id', sourceId).eq('organization_id', organizationId).eq('is_unspecified', false);
  if (source.error) throw source.error;
}

export async function saveBasicExpenseCategory({ organizationId, existingId = null, name }) {
  const clean = normalizeText(name);
  if (!clean) throw new Error('Informe o nome da categoria.');
  if (existingId) {
    const result = await neonTest.from('financial_categories').update({ name: clean, updated_at: new Date().toISOString() }).eq('id', existingId).eq('organization_id', organizationId).eq('type', 'expense');
    if (result.error) throw result.error;
    return existingId;
  }
  const result = await neonTest.from('financial_categories').insert({ organization_id: organizationId, type: 'expense', name: clean, is_default: false, active: true }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function setBasicExpenseCategoryActive(categoryId, active) {
  const result = await neonTest.from('financial_categories').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', categoryId).eq('type', 'expense');
  if (result.error) throw result.error;
}

export async function saveBasicPaymentMethod({ organizationId, existingId = null, name }) {
  const clean = normalizeText(name);
  if (!clean) throw new Error('Informe o meio de pagamento.');
  if (normalizeKey(clean) === 'a prazo') throw new Error('“A prazo” é condição financeira, não meio de pagamento.');
  if (existingId) {
    const result = await neonTest.from('finance_payment_methods').update({ name: clean, updated_at: new Date().toISOString() }).eq('id', existingId).eq('organization_id', organizationId);
    if (result.error) throw result.error;
    return existingId;
  }
  const result = await neonTest.from('finance_payment_methods').insert({ organization_id: organizationId, name: clean, is_default: false, active: true }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function setBasicPaymentMethodActive(paymentMethodId, active) {
  const result = await neonTest.from('finance_payment_methods').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', paymentMethodId);
  if (result.error) throw result.error;
}

export async function saveBasicExpense({ existingId = null, organizationId, month, mode, date = null, amount, description = '', categoryId = null, supplierId = null, paymentMethodId = null }) {
  if (!BASIC_EXPENSE_MODES.includes(mode)) throw new Error('Modo de despesas inválido.');
  const numericAmount = Number(amount || 0);
  if (!(numericAmount > 0)) throw new Error('Informe um valor maior que zero.');
  if (mode === 'individual' && !date) throw new Error('Informe a data da despesa.');
  const payload = {
    organization_id: organizationId,
    competency: competencyDate(month),
    occurred_on: mode === 'monthly' ? null : date,
    type: 'expense',
    description: normalizeText(description),
    category_id: mode === 'individual' ? (categoryId || null) : null,
    customer_id: null,
    supplier_id: mode === 'individual' ? (supplierId || null) : null,
    payment_method_id: mode === 'individual' ? (paymentMethodId || null) : null,
    amount: numericAmount,
    mode,
    entry_status: 'active',
    cancelled_at: null,
    cancel_reason: null,
    adjustment_kind: null,
    source_entry_id: null,
    updated_at: new Date().toISOString()
  };
  if (existingId) {
    const result = await neonTest.from('financial_entries').update(payload).eq('id', existingId).eq('type', 'expense');
    if (result.error) throw result.error;
    return existingId;
  }
  if (mode === 'monthly') {
    const existing = await neonTest.from('financial_entries').select('id').eq('organization_id', organizationId).eq('competency', competencyDate(month)).eq('type', 'expense').eq('mode', 'monthly').eq('entry_status', 'active').limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.length) throw new Error('Já existe um total mensal de despesas neste período.');
  }
  const result = await neonTest.from('financial_entries').insert(payload).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function deleteBasicExpense(entryId) {
  const result = await neonTest.from('financial_entries').delete().eq('id', entryId).eq('type', 'expense');
  if (result.error) throw result.error;
}

export async function cancelBasicExpense({ entryId, reason }) {
  const clean = normalizeText(reason);
  if (!clean) throw new Error('Informe o motivo do cancelamento ou estorno.');
  const result = await neonTest.from('financial_entries').update({
    entry_status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancel_reason: clean,
    updated_at: new Date().toISOString()
  }).eq('id', entryId).eq('type', 'expense');
  if (result.error) throw result.error;
}

export async function saveExpenseAdjustment({ organizationId, month, date, amount, direction = 'negative', description, sourceEntryId = null }) {
  const numericAmount = Number(amount || 0);
  if (!(numericAmount > 0)) throw new Error('Informe um valor maior que zero.');
  if (!['positive', 'negative'].includes(direction)) throw new Error('Tipo de ajuste inválido.');
  const result = await neonTest.from('financial_entries').insert({
    organization_id: organizationId,
    competency: competencyDate(month),
    occurred_on: date,
    type: 'expense',
    description: normalizeText(description) || (direction === 'negative' ? 'Reembolso / estorno de despesa' : 'Ajuste positivo de despesa'),
    category_id: null,
    customer_id: null,
    supplier_id: null,
    payment_method_id: null,
    amount: numericAmount,
    mode: 'individual',
    entry_status: 'adjustment',
    adjustment_kind: direction,
    source_entry_id: sourceEntryId,
    updated_at: new Date().toISOString()
  }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function bulkUpdateBasicExpenses({ organizationId, ids, categoryId, supplierId, paymentMethodId }) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Selecione ao menos uma despesa.');
  const patch = { updated_at: new Date().toISOString() };
  if (categoryId !== undefined) patch.category_id = categoryId || null;
  if (supplierId !== undefined) patch.supplier_id = supplierId || null;
  if (paymentMethodId !== undefined) patch.payment_method_id = paymentMethodId || null;
  if (Object.keys(patch).length === 1) throw new Error('Escolha o que deseja alterar.');
  const result = await neonTest.from('financial_entries').update(patch).eq('organization_id', organizationId).eq('type', 'expense').eq('entry_status', 'active').in('id', ids);
  if (result.error) throw result.error;
}

export async function bulkDeleteBasicExpenses({ organizationId, ids }) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Selecione ao menos uma despesa.');
  const result = await neonTest.from('financial_entries').delete().eq('organization_id', organizationId).eq('type', 'expense').eq('entry_status', 'active').in('id', ids);
  if (result.error) throw result.error;
}

export async function importBasicExpenseRows({ organizationId, month, mode, rows }) {
  if (!BASIC_EXPENSE_MODES.includes(mode)) throw new Error('Modo de despesas inválido.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Selecione ao menos uma linha válida para importar.');
  await bootstrapBasicOrganization(organizationId);

  const cleanRows = rows.map(row => ({
    date: row.date || null,
    amount: Number(row.amount || 0),
    description: normalizeText(row.description),
    categoryName: normalizeText(row.categoryName),
    supplierName: normalizeText(row.supplierName),
    document: normalizeText(row.document),
    paymentName: normalizeText(row.paymentName)
  }));
  if (cleanRows.some(row => !(row.amount > 0))) throw new Error('A importação contém valor inválido.');
  if (mode === 'individual' && cleanRows.some(row => !row.date || String(row.date).slice(0, 7) !== month)) throw new Error('A importação contém data fora do período selecionado.');
  if (mode === 'monthly' && cleanRows.length !== 1) throw new Error('No modo Total do mês, importe apenas uma linha por competência.');

  const existingResult = await neonTest.from('financial_entries').select('id,mode,entry_status').eq('organization_id', organizationId).eq('competency', competencyDate(month)).eq('type', 'expense');
  if (existingResult.error) throw existingResult.error;
  if (mode === 'monthly' && (existingResult.data || []).some(row => row.mode === 'monthly' && row.entry_status === 'active')) throw new Error('Já existe um total mensal de despesas neste período.');

  const [categoryResult, supplierResult, paymentResult] = await Promise.all([
    neonTest.from('financial_categories').select('id,name,active').eq('organization_id', organizationId).eq('type', 'expense'),
    neonTest.from('finance_suppliers').select('id,name,document,is_unspecified,merged_into,active').eq('organization_id', organizationId),
    neonTest.from('finance_payment_methods').select('id,name,active').eq('organization_id', organizationId)
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (supplierResult.error) throw supplierResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const categoryByName = new Map((categoryResult.data || []).map(item => [normalizeKey(item.name), item.id]));
  const paymentByName = new Map((paymentResult.data || []).map(item => [normalizeKey(item.name), item.id]));
  const supplierByName = new Map((supplierResult.data || []).filter(item => !item.merged_into).map(item => [normalizeKey(item.name), item.id]));
  const supplierByDocument = new Map((supplierResult.data || []).filter(item => !item.merged_into && digits(item.document)).map(item => [digits(item.document), item.id]));
  let unspecifiedId = (supplierResult.data || []).find(item => item.is_unspecified && !item.merged_into)?.id || null;

  if (mode === 'individual') {
    for (const row of cleanRows) {
      if (row.categoryName) {
        const key = normalizeKey(row.categoryName);
        if (!categoryByName.has(key)) categoryByName.set(key, await saveBasicExpenseCategory({ organizationId, name: row.categoryName }));
      }
      if (row.paymentName) {
        if (normalizeKey(row.paymentName) === 'a prazo') throw new Error('“A prazo” não pode ser usado como meio de pagamento.');
        const key = normalizeKey(row.paymentName);
        if (!paymentByName.has(key)) paymentByName.set(key, await saveBasicPaymentMethod({ organizationId, name: row.paymentName }));
      }
      if (row.supplierName) {
        const doc = digits(row.document);
        const name = normalizeKey(row.supplierName);
        const existingId = (doc && supplierByDocument.get(doc)) || supplierByName.get(name);
        if (!existingId) {
          const id = await saveBasicSupplier({ organizationId, name: row.supplierName, document: row.document });
          supplierByName.set(name, id);
          if (doc) supplierByDocument.set(doc, id);
        }
      }
    }
    if (!unspecifiedId) {
      const refreshed = await neonTest.from('finance_suppliers').select('id,is_unspecified,merged_into').eq('organization_id', organizationId);
      if (refreshed.error) throw refreshed.error;
      unspecifiedId = (refreshed.data || []).find(item => item.is_unspecified && !item.merged_into)?.id || null;
    }
  }

  const payloads = cleanRows.map(row => {
    const doc = digits(row.document);
    const supplierId = mode === 'individual'
      ? (row.supplierName ? ((doc && supplierByDocument.get(doc)) || supplierByName.get(normalizeKey(row.supplierName)) || unspecifiedId) : unspecifiedId)
      : null;
    return {
      organization_id: organizationId,
      competency: competencyDate(month),
      occurred_on: mode === 'monthly' ? null : row.date,
      type: 'expense',
      description: row.description,
      category_id: mode === 'individual' && row.categoryName ? (categoryByName.get(normalizeKey(row.categoryName)) || null) : null,
      customer_id: null,
      supplier_id: supplierId,
      payment_method_id: mode === 'individual' && row.paymentName ? (paymentByName.get(normalizeKey(row.paymentName)) || null) : null,
      amount: row.amount,
      mode,
      entry_status: 'active',
      cancelled_at: null,
      cancel_reason: null,
      adjustment_kind: null,
      source_entry_id: null,
      updated_at: new Date().toISOString()
    };
  });
  const inserted = await neonTest.from('financial_entries').insert(payloads).select('id');
  if (inserted.error) throw inserted.error;
  return { count: inserted.data?.length || payloads.length, ids: (inserted.data || []).map(item => item.id) };
}

export async function completeBasicMonth({ organizationId, month, revenueMode, expenseMode, revenueNoMovement = false, expenseNoMovement = false }) {
  const competency = competencyDate(month);
  const snapshot = {
    controlTier: BASIC_CONTROL_TIER,
    revenueMode,
    expenseMode,
    revenueSemantics: 'gross_billing',
    expenseSemantics: 'business_expense_accrual_like',
    completedAt: new Date().toISOString()
  };
  const payload = {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    revenue_no_movement: Boolean(revenueNoMovement),
    expense_no_movement: Boolean(expenseNoMovement),
    settings_snapshot: snapshot,
    reopen_reason: null,
    updated_at: new Date().toISOString()
  };
  const updated = await neonTest.from('monthly_submissions').update(payload).eq('organization_id', organizationId).eq('competency', competency).select('organization_id');
  if (updated.error) throw updated.error;
  if (updated.data?.length) return;
  const inserted = await neonTest.from('monthly_submissions').insert({ organization_id: organizationId, competency, ...payload });
  if (inserted.error) throw inserted.error;
}

export async function reopenBasicMonth({ organizationId, month, reason, actorUserId, organizationName = '' }) {
  const clean = normalizeText(reason);
  if (!clean) throw new Error('Informe o motivo da reabertura.');
  const competency = competencyDate(month);
  const current = await neonTest.from('monthly_submissions').select('reopen_count').eq('organization_id', organizationId).eq('competency', competency).limit(1);
  if (current.error) throw current.error;
  const reopenCount = Number(current.data?.[0]?.reopen_count || 0) + 1;
  const result = await neonTest.from('monthly_submissions').update({
    status: 'reopened',
    reopened_by: actorUserId || null,
    reopened_at: new Date().toISOString(),
    reopen_reason: clean,
    reopen_count: reopenCount,
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId).eq('competency', competency);
  if (result.error) throw result.error;

  const label = String(month).split('-').reverse().join('/');
  const notification = await neonTest.from('simple_control_notifications').insert({
    organization_id: organizationId,
    actor_user_id: actorUserId || null,
    notification_type: 'basic_month_reopened',
    competency,
    title: 'Mês reaberto no Controle Básico',
    message: `${organizationName || 'Cliente'} reabriu ${label}. Motivo: ${clean}`,
    metadata: { reason: clean, month, reopenCount, controlTier: BASIC_CONTROL_TIER }
  });
  if (notification.error) throw notification.error;

  if (actorUserId) {
    const audit = await neonTest.from('audit_events').insert({
      organization_id: organizationId,
      actor_user_id: actorUserId,
      event_type: 'basic_month_reopened',
      entity_type: 'monthly_submission',
      entity_id: `${organizationId}:${month}`,
      metadata: { reason: clean, month, reopenCount }
    });
    if (audit.error) throw audit.error;
  }
}

export async function markBasicNotificationRead(notificationId) {
  const result = await neonTest.from('simple_control_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  if (result.error) throw result.error;
}
