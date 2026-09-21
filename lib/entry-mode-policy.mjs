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

export function hasConflictingScheduledModes(company) {
  return Boolean(
    company.pendingRevenueMode && company.pendingExpenseMode &&
    (company.pendingRevenueMode !== company.pendingExpenseMode ||
     company.pendingRevenueModeEffective !== company.pendingExpenseModeEffective)
  );
}
