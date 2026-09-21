import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRY_MODES,
  initialEntryModePatch,
  scheduledEntryModePatch,
  hasConflictingScheduledModes
} from '../lib/entry-mode-policy.mjs';

for (const mode of ENTRY_MODES) {
  test(`primeiro acesso grava ambos como ${mode}`, () => {
    assert.deepEqual(initialEntryModePatch(mode), { revenueMode: mode, expenseMode: mode });
  });
  test(`agendamento futuro grava os dois modos e as duas vigências: ${mode}`, () => {
    assert.deepEqual(scheduledEntryModePatch(mode, '2026-10', '2026-09'), {
      pendingRevenueMode: mode, pendingExpenseMode: mode,
      pendingRevenueModeEffective: '2026-10', pendingExpenseModeEffective: '2026-10'
    });
  });
}

test('modo desconhecido e vigência atual/passada são rejeitados', () => {
  assert.throws(() => initialEntryModePatch('weekly'), /inválida/);
  assert.throws(() => scheduledEntryModePatch('daily', '2026-09', '2026-09'), /futuro/);
  assert.throws(() => scheduledEntryModePatch('daily', '2026-08', '2026-09'), /futuro/);
  assert.throws(() => scheduledEntryModePatch('daily', '2026-13', '2026-09'), /futuro/);
});

test('divergência de agendamentos legados é identificada', () => {
  assert.equal(hasConflictingScheduledModes({ pendingRevenueMode: 'daily', pendingExpenseMode: 'individual', pendingRevenueModeEffective: '2026-10', pendingExpenseModeEffective: '2026-10' }), true);
  assert.equal(hasConflictingScheduledModes({ pendingRevenueMode: 'daily', pendingExpenseMode: 'daily', pendingRevenueModeEffective: '2026-10', pendingExpenseModeEffective: '2026-11' }), true);
  assert.equal(hasConflictingScheduledModes({ pendingRevenueMode: 'daily', pendingExpenseMode: 'daily', pendingRevenueModeEffective: '2026-10', pendingExpenseModeEffective: '2026-10' }), false);
});

test('preferências não modificam lançamentos nem snapshots históricos', () => {
  const entries = Object.freeze([{ id: 'historico-receita', type: 'revenue', mode: 'monthly', amount: 300 }, { id: 'historico-despesa', type: 'expense', mode: 'individual', amount: 80 }]);
  const snapshot = Object.freeze({ revenueMode: 'monthly', expenseMode: 'individual' });
  const patch = scheduledEntryModePatch('daily', '2026-10', '2026-09');
  assert.equal('entries' in patch, false);
  assert.equal('settings_snapshot' in patch, false);
  assert.equal(entries[0].mode, 'monthly');
  assert.equal(entries[1].mode, 'individual');
  assert.deepEqual(snapshot, { revenueMode: 'monthly', expenseMode: 'individual' });
});
