'use client';

import { neonTest } from './neon-test-client';
import {
  updateBasicSettings as updateBasicSettingsLegacy
} from './neon-basic-control-legacy';

export * from './neon-basic-control-legacy';
export { importBasicExpenseRows } from './neon-import-atomic';

export async function updateBasicSettings(organizationId, patch) {
  const normalized = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalized, 'controlTier')) {
    if (!['unconfigured', 'simple', 'basic', 'complete'].includes(normalized.controlTier)) {
      throw new Error('Nível de controle inválido.');
    }
    if (normalized.controlTier === 'simple' || normalized.controlTier === 'unconfigured') {
      normalized.expenseEnabled = false;
    }
    if (normalized.controlTier === 'basic' || normalized.controlTier === 'complete') {
      normalized.expenseEnabled = true;
    }
  }
  return updateBasicSettingsLegacy(organizationId, normalized);
}

export async function scheduleControlTier(organizationId, tier, effectiveMonth) {
  if (!['simple', 'basic', 'complete'].includes(tier)) throw new Error('Nível de controle inválido.');
  return updateBasicSettingsLegacy(organizationId, {
    pendingControlTier: tier,
    pendingControlTierEffective: effectiveMonth
  });
}

export async function reopenBasicMonth({ organizationId, month, reason }) {
  const result = await neonTest.rpc('reopen_financial_month_atomic', {
    p_organization_id: organizationId,
    p_competency: `${month}-01`,
    p_reason: String(reason || '').trim()
  });
  if (result?.error) throw result.error;
  return result?.data ?? result ?? null;
}
