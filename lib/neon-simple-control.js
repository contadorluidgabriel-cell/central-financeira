'use client';

import { neonTest } from './neon-test-client';

export const SIMPLE_CONTROL_TIER = 'simple';
export const SIMPLE_MODES = ['monthly', 'daily', 'individual'];
export const DEFAULT_SIMPLE_REVENUE_CATEGORIES = [
  'Venda de produtos',
  'Prestação de serviços',
  'Comissão',
  'Outras receitas'
];
export const DEFAULT_SIMPLE_PAYMENT_METHODS = [
  'Pix',
  'Dinheiro',
  'Cartão de débito',
  'Cartão de crédito',
  'Transferência',
  'Boleto',
  'Outro'
];

const competencyDate = month => `${month}-01`;
const normalizeText = value => String(value || '').trim();

export function normalizeSimpleError(error) {
  if (!error) return 'Erro desconhecido.';
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || JSON.stringify(error);
}

function unwrap(result) {
  if (!result) return null;
  if (Object.prototype.hasOwnProperty.call(result, 'data')) return result.data;
  return result;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

async function requireOk(result) {
  if (result?.error) throw result.error;
  return unwrap(result);
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
  let [year, month] = key.split('-').map(Number);
  month -= 1;
  if (month === 0) { month = 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function nextMonth(key) {
  let [year, month] = key.split('-').map(Number);
  month += 1;
  if (month === 13) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export async function loadSimpleControlData(activeOrganizationId = null) {
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

  const [settings, categories, customers, paymentMethods, entries, submissions, notifications] = await Promise.all([
    query('organization_settings', 'organization_id,revenue_mode,control_tier,control_start_month,pending_control_tier,pending_control_tier_effective,pending_revenue_mode,pending_revenue_mode_effective,active'),
    query('financial_categories', 'id,organization_id,type,name,is_default,active,created_at,updated_at'),
    query('finance_customers', 'id,organization_id,customer_number,code,external_code,name,document,phone,email,notes,is_consumer_final,active,merged_into,created_at,updated_at'),
    query('finance_payment_methods', 'id,organization_id,name,is_default,active,created_at,updated_at'),
    query('financial_entries', 'id,organization_id,competency,occurred_on,type,description,category_id,amount,mode,customer_id,payment_method_id,entry_status,cancelled_at,cancel_reason,adjustment_kind,source_entry_id,created_at,updated_at'),
    query('monthly_submissions', 'organization_id,competency,status,revenue_no_movement,settings_snapshot,confirmed_by,confirmed_at,reopened_by,reopened_at,reopen_reason,reopen_count,updated_at'),
    appUser.system_role === 'super_admin'
      ? query('simple_control_notifications', 'id,organization_id,actor_user_id,notification_type,competency,title,message,metadata,read_at,created_at')
      : Promise.resolve([])
  ]);

  const settingsByOrg = new Map(settings.map(row => [row.organization_id, row]));
  const categoryById = new Map(categories.map(row => [row.id, row]));
  const customerById = new Map(customers.map(row => [row.id, row]));
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
      revenueMode: cfg.revenue_mode || 'monthly',
      controlTier: cfg.control_tier || SIMPLE_CONTROL_TIER,
      controlStartMonth: cfg.control_start_month ? String(cfg.control_start_month).slice(0, 7) : null,
      pendingControlTier: cfg.pending_control_tier || null,
      pendingControlTierEffective: cfg.pending_control_tier_effective ? String(cfg.pending_control_tier_effective).slice(0, 7) : null,
      pendingRevenueMode: cfg.pending_revenue_mode || null,
      pendingRevenueModeEffective: cfg.pending_revenue_mode_effective ? String(cfg.pending_revenue_mode_effective).slice(0, 7) : null,
      active: cfg.active !== false
    };
  }).filter(company => company.active);

  return {
    reload: false,
    systemRole: appUser.system_role,
    companies,
    categories,
    customers,
    paymentMethods,
    entries: entries.filter(row => row.type === 'revenue').map(row => ({
      ...row,
      companyId: row.organization_id,
      month: String(row.competency).slice(0, 7),
      date: row.occurred_on || row.competency,
      category: row.category_id ? categoryById.get(row.category_id) || null : null,
      customer: row.customer_id ? customerById.get(row.customer_id) || null : null,
      paymentMethod: row.payment_method_id ? paymentById.get(row.payment_method_id) || null : null,
      amount: Number(row.amount || 0)
    })),
    submissions: submissions.map(row => ({
      ...row,
      companyId: row.organization_id,
      month: String(row.competency).slice(0, 7),
      revenueNoMovement: Boolean(row.revenue_no_movement),
      reopenCount: Number(row.reopen_count || 0)
    })),
    notifications: [...notifications].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    currentMonth: monthKey()
  };
}

export async function bootstrapSimpleOrganization(organizationId) {
  const [categoryResult, customerResult, paymentResult] = await Promise.all([
    neonTest.from('financial_categories').select('id,name,active').eq('organization_id', organizationId).eq('type', 'revenue'),
    neonTest.from('finance_customers').select('id,is_consumer_final,active').eq('organization_id', organizationId),
    neonTest.from('finance_payment_methods').select('id,name,active').eq('organization_id', organizationId)
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (customerResult.error) throw customerResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const categoryNames = new Set((categoryResult.data || []).map(row => row.name.toLowerCase()));
  const missingCategories = DEFAULT_SIMPLE_REVENUE_CATEGORIES
    .filter(name => !categoryNames.has(name.toLowerCase()))
    .map(name => ({ organization_id: organizationId, type: 'revenue', name, is_default: true, active: true }));
  if (missingCategories.length) {
    const result = await neonTest.from('financial_categories').insert(missingCategories);
    if (result.error) throw result.error;
  }

  const hasConsumerFinal = (customerResult.data || []).some(row => row.is_consumer_final);
  if (!hasConsumerFinal) {
    const result = await neonTest.from('finance_customers').insert({
      organization_id: organizationId,
      name: 'Consumidor final',
      is_consumer_final: true,
      active: true
    });
    if (result.error) throw result.error;
  }

  const paymentNames = new Set((paymentResult.data || []).map(row => row.name.toLowerCase()));
  const missingPayments = DEFAULT_SIMPLE_PAYMENT_METHODS
    .filter(name => !paymentNames.has(name.toLowerCase()))
    .map(name => ({ organization_id: organizationId, name, is_default: true, active: true }));
  if (missingPayments.length) {
    const result = await neonTest.from('finance_payment_methods').insert(missingPayments);
    if (result.error) throw result.error;
  }
}

export async function updateSimpleSettings(organizationId, patch) {
  const payload = { updated_at: new Date().toISOString() };
  if (Object.prototype.hasOwnProperty.call(patch, 'revenueMode')) payload.revenue_mode = patch.revenueMode;
  if (Object.prototype.hasOwnProperty.call(patch, 'controlTier')) payload.control_tier = patch.controlTier;
  if (Object.prototype.hasOwnProperty.call(patch, 'controlStartMonth')) payload.control_start_month = patch.controlStartMonth ? competencyDate(patch.controlStartMonth) : null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueMode')) payload.pending_revenue_mode = patch.pendingRevenueMode || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueModeEffective')) payload.pending_revenue_mode_effective = patch.pendingRevenueModeEffective ? competencyDate(patch.pendingRevenueModeEffective) : null;
  const result = await neonTest.from('organization_settings').update(payload).eq('organization_id', organizationId);
  if (result.error) throw result.error;
}

export async function scheduleRevenueMode(organizationId, mode, effectiveMonth) {
  if (!SIMPLE_MODES.includes(mode)) throw new Error('Modo de faturamento inválido.');
  await updateSimpleSettings(organizationId, {
    pendingRevenueMode: mode,
    pendingRevenueModeEffective: effectiveMonth
  });
}

export async function applyScheduledRevenueMode(company, month) {
  if (!company.pendingRevenueMode || company.pendingRevenueModeEffective !== month) return false;
  await updateSimpleSettings(company.id, {
    revenueMode: company.pendingRevenueMode,
    pendingRevenueMode: null,
    pendingRevenueModeEffective: null
  });
  return true;
}

export async function saveSimpleCustomer({ organizationId, existingId = null, name, document = '', phone = '', email = '', notes = '', externalCode = '' }) {
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
  if (!payload.name) throw new Error('Informe o nome do cliente.');

  if (existingId) {
    const result = await neonTest.from('finance_customers').update(payload).eq('id', existingId);
    if (result.error) throw result.error;
    return existingId;
  }

  const result = await neonTest.from('finance_customers').insert({ ...payload, active: true }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function setSimpleCustomerActive(customerId, active) {
  const result = await neonTest.from('finance_customers').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', customerId).eq('is_consumer_final', false);
  if (result.error) throw result.error;
}

export async function deleteUnusedSimpleCustomer(customerId) {
  const used = await neonTest.from('financial_entries').select('id').eq('customer_id', customerId).limit(1);
  if (used.error) throw used.error;
  if (used.data?.length) throw new Error('Este cliente já possui receitas. Inative o cadastro em vez de excluir.');
  const result = await neonTest.from('finance_customers').delete().eq('id', customerId).eq('is_consumer_final', false);
  if (result.error) throw result.error;
}

export async function mergeSimpleCustomers({ organizationId, sourceId, targetId }) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error('Selecione dois clientes diferentes.');
  const move = await neonTest.from('financial_entries').update({ customer_id: targetId, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('customer_id', sourceId);
  if (move.error) throw move.error;
  const source = await neonTest.from('finance_customers').update({ active: false, merged_into: targetId, updated_at: new Date().toISOString() }).eq('id', sourceId).eq('organization_id', organizationId).eq('is_consumer_final', false);
  if (source.error) throw source.error;
}

export async function saveSimpleCategory({ organizationId, existingId = null, name }) {
  const clean = normalizeText(name);
  if (!clean) throw new Error('Informe o nome da categoria.');
  if (existingId) {
    const result = await neonTest.from('financial_categories').update({ name: clean, updated_at: new Date().toISOString() }).eq('id', existingId).eq('organization_id', organizationId).eq('type', 'revenue');
    if (result.error) throw result.error;
    return existingId;
  }
  const result = await neonTest.from('financial_categories').insert({ organization_id: organizationId, type: 'revenue', name: clean, is_default: false, active: true }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function setSimpleCategoryActive(categoryId, active) {
  const result = await neonTest.from('financial_categories').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', categoryId).eq('type', 'revenue');
  if (result.error) throw result.error;
}

export async function saveSimplePaymentMethod({ organizationId, existingId = null, name }) {
  const clean = normalizeText(name);
  if (!clean) throw new Error('Informe o meio de pagamento.');
  if (existingId) {
    const result = await neonTest.from('finance_payment_methods').update({ name: clean, updated_at: new Date().toISOString() }).eq('id', existingId).eq('organization_id', organizationId);
    if (result.error) throw result.error;
    return existingId;
  }
  const result = await neonTest.from('finance_payment_methods').insert({ organization_id: organizationId, name: clean, is_default: false, active: true }).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function setSimplePaymentMethodActive(paymentMethodId, active) {
  const result = await neonTest.from('finance_payment_methods').update({ active: Boolean(active), updated_at: new Date().toISOString() }).eq('id', paymentMethodId);
  if (result.error) throw result.error;
}

export async function saveSimpleRevenue({
  existingId = null,
  organizationId,
  month,
  mode,
  date = null,
  amount,
  description = '',
  categoryId = null,
  customerId = null,
  paymentMethodId = null
}) {
  if (!SIMPLE_MODES.includes(mode)) throw new Error('Modo de faturamento inválido.');
  const numericAmount = Number(amount || 0);
  if (!(numericAmount > 0)) throw new Error('Informe um valor maior que zero.');

  const payload = {
    organization_id: organizationId,
    competency: competencyDate(month),
    occurred_on: mode === 'monthly' ? null : date,
    type: 'revenue',
    description: normalizeText(description),
    category_id: mode === 'individual' ? (categoryId || null) : null,
    customer_id: mode === 'individual' ? (customerId || null) : null,
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

  if (mode !== 'monthly' && !date) throw new Error('Informe a data da venda ou serviço.');

  if (existingId) {
    const result = await neonTest.from('financial_entries').update(payload).eq('id', existingId);
    if (result.error) throw result.error;
    return existingId;
  }

  const result = await neonTest.from('financial_entries').insert(payload).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function importSimpleRevenueRows({ organizationId, month, mode, rows }) {
  if (!SIMPLE_MODES.includes(mode)) throw new Error('Modo de faturamento inválido.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Selecione ao menos uma linha válida para importar.');

  await bootstrapSimpleOrganization(organizationId);

  const cleanRows = rows.map(row => ({
    date: row.date || null,
    amount: Number(row.amount || 0),
    description: normalizeText(row.description),
    categoryName: normalizeText(row.categoryName),
    customerName: normalizeText(row.customerName),
    document: normalizeText(row.document),
    paymentName: normalizeText(row.paymentName)
  }));
  if (cleanRows.some(row => !(row.amount > 0))) throw new Error('A importação contém valor inválido.');
  if (mode !== 'monthly' && cleanRows.some(row => !row.date || String(row.date).slice(0, 7) !== month)) throw new Error('A importação contém data fora do período selecionado.');
  if (mode === 'monthly' && cleanRows.length !== 1) throw new Error('No modo Total do mês, importe apenas uma linha por competência.');

  const existingResult = await neonTest.from('financial_entries')
    .select('id,occurred_on,mode,entry_status')
    .eq('organization_id', organizationId)
    .eq('competency', competencyDate(month))
    .eq('type', 'revenue');
  if (existingResult.error) throw existingResult.error;
  const activeExisting = (existingResult.data || []).filter(row => row.entry_status === 'active');
  if (mode === 'monthly' && activeExisting.some(row => row.mode === 'monthly')) throw new Error('Já existe um faturamento mensal ativo neste período.');
  if (mode === 'daily') {
    const dates = new Set();
    const existingDates = new Set(activeExisting.filter(row => row.mode === 'daily').map(row => String(row.occurred_on).slice(0, 10)));
    for (const row of cleanRows) {
      if (dates.has(row.date) || existingDates.has(row.date)) throw new Error(`Já existe um total diário para ${row.date}.`);
      dates.add(row.date);
    }
  }

  const normalizeKey = value => normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const documentKey = value => normalizeText(value).replace(/\D/g, '');
  const [categoryResult, customerResult, paymentResult] = await Promise.all([
    neonTest.from('financial_categories').select('id,name,active').eq('organization_id', organizationId).eq('type', 'revenue'),
    neonTest.from('finance_customers').select('id,name,document,is_consumer_final,merged_into,active').eq('organization_id', organizationId),
    neonTest.from('finance_payment_methods').select('id,name,active').eq('organization_id', organizationId)
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (customerResult.error) throw customerResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const categoryByName = new Map((categoryResult.data || []).map(item => [normalizeKey(item.name), item.id]));
  const paymentByName = new Map((paymentResult.data || []).map(item => [normalizeKey(item.name), item.id]));
  const customerByName = new Map((customerResult.data || []).filter(item => !item.merged_into).map(item => [normalizeKey(item.name), item.id]));
  const customerByDocument = new Map((customerResult.data || []).filter(item => !item.merged_into && documentKey(item.document)).map(item => [documentKey(item.document), item.id]));
  let consumerFinalId = (customerResult.data || []).find(item => item.is_consumer_final && !item.merged_into)?.id || null;

  if (mode === 'individual') {
    for (const row of cleanRows) {
      if (row.categoryName) {
        const key = normalizeKey(row.categoryName);
        if (!categoryByName.has(key)) categoryByName.set(key, await saveSimpleCategory({ organizationId, name: row.categoryName }));
      }
      if (row.paymentName) {
        if (normalizeKey(row.paymentName) === 'a prazo') throw new Error('“A prazo” não pode ser usado como meio de pagamento.');
        const key = normalizeKey(row.paymentName);
        if (!paymentByName.has(key)) paymentByName.set(key, await saveSimplePaymentMethod({ organizationId, name: row.paymentName }));
      }
      if (row.customerName) {
        const doc = documentKey(row.document);
        const name = normalizeKey(row.customerName);
        const existingId = (doc && customerByDocument.get(doc)) || customerByName.get(name);
        if (!existingId) {
          const id = await saveSimpleCustomer({ organizationId, name: row.customerName, document: row.document });
          customerByName.set(name, id);
          if (doc) customerByDocument.set(doc, id);
        }
      }
    }
    if (!consumerFinalId) {
      const refreshed = await neonTest.from('finance_customers').select('id,is_consumer_final,merged_into').eq('organization_id', organizationId);
      if (refreshed.error) throw refreshed.error;
      consumerFinalId = (refreshed.data || []).find(item => item.is_consumer_final && !item.merged_into)?.id || null;
    }
  }

  const payloads = cleanRows.map(row => {
    let customerId = null;
    if (mode === 'individual') {
      const doc = documentKey(row.document);
      customerId = row.customerName
        ? ((doc && customerByDocument.get(doc)) || customerByName.get(normalizeKey(row.customerName)) || consumerFinalId)
        : consumerFinalId;
    }
    return {
      organization_id: organizationId,
      competency: competencyDate(month),
      occurred_on: mode === 'monthly' ? null : row.date,
      type: 'revenue',
      description: row.description,
      category_id: mode === 'individual' && row.categoryName ? (categoryByName.get(normalizeKey(row.categoryName)) || null) : null,
      customer_id: mode === 'individual' ? customerId : null,
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

export async function deleteSimpleRevenue(entryId) {
  const result = await neonTest.from('financial_entries').delete().eq('id', entryId);
  if (result.error) throw result.error;
}

export async function cancelSimpleRevenue({ entryId, reason }) {
  const cleanReason = normalizeText(reason);
  if (!cleanReason) throw new Error('Informe o motivo do cancelamento.');
  const result = await neonTest.from('financial_entries').update({
    entry_status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancel_reason: cleanReason,
    updated_at: new Date().toISOString()
  }).eq('id', entryId);
  if (result.error) throw result.error;
}

export async function saveRevenueAdjustment({ organizationId, month, date, amount, direction = 'negative', description, sourceEntryId = null }) {
  const numericAmount = Number(amount || 0);
  if (!(numericAmount > 0)) throw new Error('Informe um valor maior que zero.');
  if (!['positive', 'negative'].includes(direction)) throw new Error('Tipo de ajuste inválido.');
  const result = await neonTest.from('financial_entries').insert({
    organization_id: organizationId,
    competency: competencyDate(month),
    occurred_on: date,
    type: 'revenue',
    description: normalizeText(description) || (direction === 'negative' ? 'Estorno / ajuste negativo' : 'Ajuste positivo'),
    category_id: null,
    customer_id: null,
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

export async function completeSimpleMonth({ organizationId, month, revenueMode, noMovement = false }) {
  const competency = competencyDate(month);
  const snapshot = {
    controlTier: SIMPLE_CONTROL_TIER,
    revenueMode,
    revenueSemantics: 'gross_billing',
    completedAt: new Date().toISOString()
  };
  const payload = {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    revenue_no_movement: Boolean(noMovement),
    expense_no_movement: false,
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

export async function reopenSimpleMonth({ organizationId, month, reason, actorUserId, organizationName = '' }) {
  const cleanReason = normalizeText(reason);
  if (!cleanReason) throw new Error('Informe o motivo da reabertura.');
  const competency = competencyDate(month);
  const current = await neonTest.from('monthly_submissions').select('reopen_count').eq('organization_id', organizationId).eq('competency', competency).limit(1);
  if (current.error) throw current.error;
  const reopenCount = Number(current.data?.[0]?.reopen_count || 0) + 1;

  const result = await neonTest.from('monthly_submissions').update({
    status: 'reopened',
    reopened_by: actorUserId || null,
    reopened_at: new Date().toISOString(),
    reopen_reason: cleanReason,
    reopen_count: reopenCount,
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId).eq('competency', competency);
  if (result.error) throw result.error;

  const monthLabel = month.split('-').reverse().join('/');
  const notification = await neonTest.from('simple_control_notifications').insert({
    organization_id: organizationId,
    actor_user_id: actorUserId || null,
    notification_type: 'month_reopened',
    competency,
    title: 'Mês reaberto',
    message: `${organizationName || 'Cliente'} reabriu ${monthLabel}. Motivo: ${cleanReason}`,
    metadata: { reason: cleanReason, month, reopenCount }
  });
  if (notification.error) throw notification.error;

  if (actorUserId) {
    const audit = await neonTest.from('audit_events').insert({
      organization_id: organizationId,
      actor_user_id: actorUserId,
      event_type: 'simple_month_reopened',
      entity_type: 'monthly_submission',
      entity_id: `${organizationId}:${month}`,
      metadata: { reason: cleanReason, month, reopenCount }
    });
    if (audit.error) throw audit.error;
  }
}

export async function markSimpleNotificationRead(notificationId) {
  const result = await neonTest.from('simple_control_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  if (result.error) throw result.error;
}
