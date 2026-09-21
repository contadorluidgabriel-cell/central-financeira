export const ENTRY_MODES = Object.freeze(['monthly', 'daily', 'individual']);

export function assertEntryMode(mode) {
  if (!ENTRY_MODES.includes(mode)) throw new Error('Forma de lançamento inválida.');
  return mode;
}

export function initialEntryModePatch(mode) {
  assertEntryMode(mode);
  return { revenueMode: mode, expenseMode: mode };
}

export function scheduledEntryModePatch(mode, effectiveMonth, currentMonth) {
  assertEntryMode(mode);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(effectiveMonth)) || effectiveMonth <= currentMonth) {
    throw new Error('A mudança precisa começar em um mês futuro.');
  }
  return {
    pendingRevenueMode: mode,
    pendingExpenseMode: mode,
    pendingRevenueModeEffective: effectiveMonth,
    pendingExpenseModeEffective: effectiveMonth
  };
}

export function normalizeAppliedEntryModePatch(patch) {
  const normalized = { ...patch };
  const has = key => Object.prototype.hasOwnProperty.call(normalized, key);
  if (has('revenueMode') && has('expenseMode') && normalized.revenueMode !== normalized.expenseMode) {
    throw new Error('Receitas e despesas precisam ter a mesma forma de lançamento.');
  }
  if (has('revenueMode') || has('expenseMode')) {
    const mode = assertEntryMode(has('revenueMode') ? normalized.revenueMode : normalized.expenseMode);
    normalized.revenueMode = mode;
    normalized.expenseMode = mode;
  }
  if (has('pendingRevenueMode') && has('pendingExpenseMode') && normalized.pendingRevenueMode !== normalized.pendingExpenseMode) {
    throw new Error('Agendamentos de receitas e despesas precisam ser iguais.');
  }
  if (has('pendingRevenueMode') || has('pendingExpenseMode')) {
    const mode = has('pendingRevenueMode') ? normalized.pendingRevenueMode : normalized.pendingExpenseMode;
    if (mode !== null) assertEntryMode(mode);
    normalized.pendingRevenueMode = mode;
    normalized.pendingExpenseMode = mode;
  }
  if (has('pendingRevenueModeEffective') && has('pendingExpenseModeEffective') && normalized.pendingRevenueModeEffective !== normalized.pendingExpenseModeEffective) {
    throw new Error('Agendamentos de receitas e despesas precisam ter a mesma vigência.');
  }
  if (has('pendingRevenueModeEffective') || has('pendingExpenseModeEffective')) {
    const effective = has('pendingRevenueModeEffective') ? normalized.pendingRevenueModeEffective : normalized.pendingExpenseModeEffective;
    normalized.pendingRevenueModeEffective = effective;
    normalized.pendingExpenseModeEffective = effective;
  }
  return normalized;
}

export function hasConflictingScheduledModes(company) {
  return Boolean(
    company.pendingRevenueMode && company.pendingExpenseMode &&
    (company.pendingRevenueMode !== company.pendingExpenseMode ||
     company.pendingRevenueModeEffective !== company.pendingExpenseModeEffective)
  );
}
