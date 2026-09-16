'use client';

import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

// Integração OFX: esta branch de QA nunca deve consultar o Neon de produção.
const authUrl = 'https://ep-red-dust-ay8eyrl5.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth';
const dataApiUrl = 'https://ep-red-dust-ay8eyrl5.apirest.c-5.us-east-2.aws.neon.tech/neondb/rest/v1';

export const neonConfigured = Boolean(authUrl && dataApiUrl);
export const neon = neonConfigured
  ? createClient({
      auth: { adapter: BetterAuthReactAdapter(), url: authUrl },
      dataApi: { url: dataApiUrl }
    })
  : null;
export const neonTestConfigured = neonConfigured;
export const neonTest = neon;
