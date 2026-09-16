// Batch preparation never posts anything. The user must review the summary and confirm.
const AMBIGUOUS = /transfer|transf\b|estorno|emprest|aplicac|resgate|saldo inicial|devoluc|entre contas|fatura do cartao|pagamento de cartao|pagto cartao|adiantamento|investimento/i;

export function prepareOfxBatch(rows, tier, limit = 100) {
  const pending = (Array.isArray(rows) ? rows : []).filter(row => !row.posted_at);
  const flagged = [];
  const unsupported = [];
  const eligible = [];
  for (const row of pending) {
    const amount = Number(row.amount);
    const description = String(row.description || '').trim();
    if (!Number.isFinite(amount) || amount === 0 || !description || description.length > 300) {
      unsupported.push(row);
      continue;
    }
    if (AMBIGUOUS.test(description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) {
      flagged.push(row);
      continue;
    }
    if (amount < 0 && tier === 'simple') {
      unsupported.push(row);
      continue;
    }
    eligible.push(row);
  }
  const prepared = eligible.slice(0, Math.max(1, Math.min(100, Number(limit) || 100)));
  const choices = Object.fromEntries(prepared.map(row => [row.id, {
    entryType: Number(row.amount) > 0 ? 'revenue' : 'expense',
    categoryId: '',
    description: String(row.description).trim()
  }]));
  return { choices, prepared: prepared.length, flagged: flagged.length, unsupported: unsupported.length, remaining: eligible.length - prepared.length };
}
