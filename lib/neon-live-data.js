'use client';

import { neonTest } from './neon-test-client';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_REVENUE_CATEGORIES, monthKey } from './demo-data';

export function normalizeError(error) {
  if (!error) return 'Erro desconhecido.';
  if (typeof error === 'string') return error;
  return error.message || error.error_description || error.error || JSON.stringify(error);
}

export function unwrap(result) {
  if (!result) return null;
  if (Object.prototype.hasOwnProperty.call(result, 'data')) return result.data;
  return result;
}

export function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 42);
}

const competencyDate = key => `${key}-01`;

async function requireOk(result) {
  if (result?.error) throw result.error;
  return unwrap(result);
}

async function query(table, columns = '*') {
  const result = await neonTest.from(table).select(columns);
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadCentralData(activeOrganizationId = null) {
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

  const [settings, categories, entries, submissionsRaw, closingsRaw] = await Promise.all([
    query('organization_settings', 'organization_id,revenue_mode,expense_enabled,expense_mode,active'),
    query('financial_categories', 'id,organization_id,type,name,is_default,active'),
    query('financial_entries', 'id,organization_id,competency,occurred_on,type,description,category_id,amount,mode,created_at'),
    query('monthly_submissions', 'organization_id,competency,status,confirmed_at,revenue_no_movement,expense_no_movement'),
    query('monthly_closings', 'organization_id,competency,status,analysis,attention,recommendation,closed_at,updated_at')
  ]);

  const settingByOrg = new Map(settings.map(row => [row.organization_id, row]));
  const categoryById = new Map(categories.map(row => [row.id, row]));

  const companies = organizations.map(org => {
    const cfg = settingByOrg.get(org.id) || {};
    const metadata = parseMetadata(org.metadata);
    const activeCustom = categories.filter(row => row.organization_id === org.id && !row.is_default && row.active);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      document: metadata.document || 'Não informado',
      contact: metadata.contact || '',
      metadata,
      revenueMode: cfg.revenue_mode || 'monthly',
      expenseEnabled: Boolean(cfg.expense_enabled),
      expenseMode: cfg.expense_mode || 'category',
      active: cfg.active !== false,
      customRevenueCategories: activeCustom.filter(row => row.type === 'revenue').map(row => row.name),
      customExpenseCategories: activeCustom.filter(row => row.type === 'expense').map(row => row.name)
    };
  }).filter(company => company.active);

  const mappedEntries = entries.map(row => {
    const category = row.category_id ? categoryById.get(row.category_id) : null;
    return {
      id: row.id,
      companyId: row.organization_id,
      type: row.type,
      month: String(row.competency).slice(0, 7),
      date: row.occurred_on || row.competency,
      description: row.description,
      category: category?.name || (row.type === 'revenue' ? 'Receitas' : 'Despesas'),
      categoryId: row.category_id,
      amount: Number(row.amount || 0),
      mode: row.mode,
      createdAt: row.created_at
    };
  });

  const submissions = submissionsRaw
    .filter(row => row.status === 'confirmed')
    .map(row => ({
      companyId: row.organization_id,
      month: String(row.competency).slice(0, 7),
      confirmedAt: row.confirmed_at,
      revenueNoMovement: row.revenue_no_movement,
      expenseNoMovement: row.expense_no_movement
    }));

  const closings = closingsRaw.map(row => ({
    companyId: row.organization_id,
    month: String(row.competency).slice(0, 7),
    analysis: row.analysis || '',
    attention: row.attention || '',
    recommendation: row.recommendation || '',
    closed: row.status === 'closed',
    closedAt: row.closed_at,
    updatedAt: row.updated_at
  }));

  return {
    reload: false,
    systemRole: appUser.system_role,
    companies,
    entries: mappedEntries,
    submissions,
    closings,
    categoryRows: categories,
    month: monthKey()
  };
}

export async function createCompany({ name, document, contact, revenueMode, expenseEnabled }) {
  const orgResult = await neonTest.auth.organization.create({
    name,
    slug: `${slugify(name)}-${Date.now().toString().slice(-6)}`,
    metadata: { document: document || '', contact: contact || '' },
    keepCurrentActiveOrganization: true
  });
  const org = await requireOk(orgResult);
  const organizationId = org?.id || org?.organization?.id;
  if (!organizationId) throw new Error('A organização foi criada, mas o identificador não retornou.');

  const settingsResult = await neonTest.from('organization_settings').insert({
    organization_id: organizationId,
    revenue_mode: revenueMode || 'monthly',
    expense_enabled: Boolean(expenseEnabled),
    expense_mode: 'category',
    active: true
  });
  if (settingsResult.error) throw settingsResult.error;

  const rows = [
    ...DEFAULT_REVENUE_CATEGORIES.map(name => ({ organization_id: organizationId, type: 'revenue', name, is_default: true, active: true })),
    ...DEFAULT_EXPENSE_CATEGORIES.map(name => ({ organization_id: organizationId, type: 'expense', name, is_default: true, active: true }))
  ];
  const categoryResult = await neonTest.from('financial_categories').insert(rows);
  if (categoryResult.error) throw categoryResult.error;

  return organizationId;
}

export async function updateCompanyMetadata(company, patch) {
  const metadata = { ...(company.metadata || {}), ...patch };
  const result = await neonTest.auth.organization.update({
    organizationId: company.id,
    data: { metadata }
  });
  await requireOk(result);
}

export async function updateOrganizationSettings(organizationId, patch) {
  const mapped = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'revenueMode')) mapped.revenue_mode = patch.revenueMode;
  if (Object.prototype.hasOwnProperty.call(patch, 'expenseEnabled')) mapped.expense_enabled = Boolean(patch.expenseEnabled);
  if (Object.prototype.hasOwnProperty.call(patch, 'expenseMode')) mapped.expense_mode = patch.expenseMode;
  if (!Object.keys(mapped).length) return;
  mapped.updated_at = new Date().toISOString();
  const result = await neonTest.from('organization_settings').update(mapped).eq('organization_id', organizationId);
  if (result.error) throw result.error;
}

export async function addCategory(organizationId, type, name, isDefault = false) {
  const result = await neonTest.from('financial_categories').insert({
    organization_id: organizationId,
    type,
    name,
    is_default: isDefault,
    active: true
  }).select('id,organization_id,type,name,is_default,active');
  if (result.error) throw result.error;
  return result.data?.[0] || null;
}

export async function deactivateCategory(organizationId, type, name) {
  const result = await neonTest.from('financial_categories')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('type', type)
    .eq('name', name)
    .eq('is_default', false);
  if (result.error) throw result.error;
}

export async function ensureCategory(categoryRows, organizationId, type, name) {
  const existing = categoryRows.find(row => row.organization_id === organizationId && row.type === type && row.name === name && row.active);
  if (existing) return existing.id;
  const defaultNames = type === 'revenue' ? DEFAULT_REVENUE_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
  const created = await addCategory(organizationId, type, name, defaultNames.includes(name));
  return created?.id || null;
}

export async function saveFinancialEntry({ existingId, organizationId, competency, occurredOn, type, description, categoryId, amount, mode }) {
  const payload = {
    organization_id: organizationId,
    competency: competencyDate(competency),
    occurred_on: ['daily', 'individual'].includes(mode) ? occurredOn : null,
    type,
    description: description || '',
    category_id: categoryId || null,
    amount: Number(amount || 0),
    mode,
    updated_at: new Date().toISOString()
  };

  if (existingId) {
    const result = await neonTest.from('financial_entries').update(payload).eq('id', existingId);
    if (result.error) throw result.error;
    return existingId;
  }

  const result = await neonTest.from('financial_entries').insert(payload).select('id');
  if (result.error) throw result.error;
  return result.data?.[0]?.id || null;
}

export async function deleteFinancialEntry(id) {
  const result = await neonTest.from('financial_entries').delete().eq('id', id);
  if (result.error) throw result.error;
}

export async function confirmMonth({ organizationId, month, revenueNoMovement = false, expenseNoMovement = false, settingsSnapshot = {} }) {
  const competency = competencyDate(month);
  const payload = {
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    revenue_no_movement: Boolean(revenueNoMovement),
    expense_no_movement: Boolean(expenseNoMovement),
    settings_snapshot: settingsSnapshot,
    reopened_by: null,
    reopened_at: null,
    updated_at: new Date().toISOString()
  };
  const updated = await neonTest.from('monthly_submissions')
    .update(payload)
    .eq('organization_id', organizationId)
    .eq('competency', competency)
    .select('organization_id');
  if (updated.error) throw updated.error;
  if (updated.data?.length) return;
  const inserted = await neonTest.from('monthly_submissions').insert({ organization_id: organizationId, competency, ...payload });
  if (inserted.error) throw inserted.error;
}

export async function reopenMonthSubmission(organizationId, month) {
  const result = await neonTest.from('monthly_submissions').update({
    status: 'reopened',
    reopened_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId).eq('competency', competencyDate(month));
  if (result.error) throw result.error;
}

export async function saveMonthlyClosing({ organizationId, month, analysis, attention, recommendation, close }) {
  const competency = competencyDate(month);
  const payload = {
    status: close ? 'closed' : 'draft',
    analysis: analysis || '',
    attention: attention || '',
    recommendation: recommendation || '',
    closed_at: close ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };
  const updated = await neonTest.from('monthly_closings')
    .update(payload)
    .eq('organization_id', organizationId)
    .eq('competency', competency)
    .select('organization_id');
  if (updated.error) throw updated.error;
  if (updated.data?.length) return;
  const inserted = await neonTest.from('monthly_closings').insert({ organization_id: organizationId, competency, ...payload });
  if (inserted.error) throw inserted.error;
}

export async function reopenMonthlyClosing(organizationId, month) {
  const closing = await neonTest.from('monthly_closings').update({
    status: 'draft',
    closed_at: null,
    reopened_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId).eq('competency', competencyDate(month));
  if (closing.error) throw closing.error;
  await reopenMonthSubmission(organizationId, month);
}
