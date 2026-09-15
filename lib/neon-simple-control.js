'use client';

import { neonTest } from './neon-test-client';

export * from './neon-simple-control-legacy';
export { importSimpleRevenueRows } from './neon-import-atomic';

export async function reopenSimpleMonth({ organizationId, month, reason }) {
  const result = await neonTest.rpc('reopen_financial_month_atomic', {
    p_organization_id: organizationId,
    p_competency: `${month}-01`,
    p_reason: String(reason || '').trim()
  });
  if (result?.error) throw result.error;
  return result?.data ?? result ?? null;
}
