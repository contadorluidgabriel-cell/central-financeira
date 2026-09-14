'use client';

import { useEffect, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import CentralFinanceiraV2 from './CentralFinanceiraV2';
import SimpleControlAppV2 from './SimpleControlAppV2';
import BasicControlAppV1 from './BasicControlAppV1';

export default function CentralFinanceiraEntry() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [experience, setExperience] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    async function resolveExperience() {
      if (session.isPending) return;
      if (!user) {
        if (!cancelled) setExperience('v2');
        return;
      }

      try {
        const roleResult = await neonTest.from('app_users').select('system_role,active').limit(1);
        if (roleResult.error) throw roleResult.error;
        const appUser = roleResult.data?.[0] || { system_role: 'client_user', active: true };

        if (!appUser.active || appUser.system_role === 'super_admin') {
          if (!cancelled) setExperience('v2');
          return;
        }

        const orgResult = await neonTest.auth.organization.list();
        if (orgResult?.error) throw orgResult.error;
        const organizations = orgResult?.data || [];
        const fallbackOrganizationId = organizations[0]?.id || null;
        const organizationId = activeOrganizationId || fallbackOrganizationId;

        if (!organizationId) {
          if (!cancelled) setExperience('v2');
          return;
        }

        const settingsResult = await neonTest
          .from('organization_settings')
          .select('organization_id,control_tier,control_start_month,active')
          .eq('organization_id', organizationId)
          .limit(1);
        if (settingsResult.error) throw settingsResult.error;

        const settings = settingsResult.data?.[0] || null;
        if (settings?.active === false) {
          if (!cancelled) setExperience('v2');
          return;
        }

        const needsOnboarding = !settings || settings.control_tier === 'unconfigured' || !settings.control_start_month;
        if (!cancelled) {
          if (needsOnboarding || settings.control_tier === 'simple') setExperience('simple');
          else if (settings.control_tier === 'basic') setExperience('basic');
          else setExperience('v2');
        }
      } catch {
        if (!cancelled) setExperience('v2');
      }
    }

    resolveExperience();
    return () => { cancelled = true; };
  }, [session.isPending, user?.id, activeOrganizationId]);

  if (session.isPending || experience === 'loading') {
    return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui,sans-serif',background:'#F6F8FC',color:'#667085'}}>Carregando Central Financeira…</div>;
  }

  if (experience === 'simple') return <SimpleControlAppV2 />;
  if (experience === 'basic') return <BasicControlAppV1 />;
  return <CentralFinanceiraV2 />;
}
