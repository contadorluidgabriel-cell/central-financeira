'use client';

import { neonTest } from './neon-test-client';

const normalizeText = value => String(value ?? '').trim();
const SIMPLE_MODES = ['monthly', 'daily', 'individual'];

function normalizeResult(result, fallbackCount) {
  if (result?.error) throw result.error;
  const data = result?.data ?? result;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  if (Array.isArray(data) && data.length === 1 && data[0] && typeof data[0] === 'object') {
    const first = data[0];
    if (first.import_financial_entries_atomic) return first.import_financial_entries_atomic;
    return first;
  }
  return { count: fallbackCount, ids: [] };
}

function cleanRevenueRows(rows) {
  return rows.map(row => ({
    date: row.date || null,
    amount: Number(row.amount || 0),
    description: normalizeText(row.description),
    categoryName: normalizeText(row.categoryName),
    customerName: normalizeText(row.customerName),
    document: normalizeText(row.document),
    paymentName: normalizeText(row.paymentName)
  }));
}

function cleanExpenseRows(rows) {
  return rows.map(row => ({
    date: row.date || null,
    amount: Number(row.amount || 0),
    description: normalizeText(row.description),
    categoryName: normalizeText(row.categoryName),
    supplierName: normalizeText(row.supplierName),
    document: normalizeText(row.document),
    paymentName: normalizeText(row.paymentName)
  }));
}

async function runAtomicImport({ organizationId, month, mode, type, rows }) {
  if (!organizationId) throw new Error('Empresa não informada.');
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('Competência inválida.');
  if (!SIMPLE_MODES.includes(mode)) throw new Error(type === 'expense' ? 'Modo de despesas inválido.' : 'Modo de faturamento inválido.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Selecione ao menos uma linha válida para importar.');

  const cleanRows = type === 'expense' ? cleanExpenseRows(rows) : cleanRevenueRows(rows);
  if (cleanRows.some(row => !(row.amount > 0))) throw new Error('A importação contém valor inválido.');
  if (mode !== 'monthly' && cleanRows.some(row => !row.date || String(row.date).slice(0, 7) !== month)) {
    throw new Error('A importação contém data fora do período selecionado.');
  }
  if (mode === 'monthly' && cleanRows.length !== 1) {
    throw new Error('No modo Total do mês, importe apenas uma linha por competência.');
  }

  const result = await neonTest.rpc('import_financial_entries_atomic', {
    p_organization_id: organizationId,
    p_competency: `${month}-01`,
    p_type: type,
    p_mode: mode,
    p_rows: cleanRows
  });
  return normalizeResult(result, cleanRows.length);
}

export async function importSimpleRevenueRows({ organizationId, month, mode, rows }) {
  return runAtomicImport({ organizationId, month, mode, type: 'revenue', rows });
}

export async function importBasicExpenseRows({ organizationId, month, mode, rows }) {
  return runAtomicImport({ organizationId, month, mode, type: 'expense', rows });
}
