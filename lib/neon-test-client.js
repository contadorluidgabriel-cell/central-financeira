'use client';

import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

// Endpoints públicos da branch Neon de teste. Variáveis de ambiente continuam
// tendo prioridade quando existirem, mas o laboratório não depende delas.
const authUrl =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
  'https://ep-summer-bird-aybs43vg.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth';

const dataApiUrl =
  process.env.NEXT_PUBLIC_NEON_DATA_API_URL ||
  'https://ep-summer-bird-aybs43vg.apirest.c-5.us-east-2.aws.neon.tech/neondb/rest/v1';

export const neonTestConfigured = Boolean(authUrl && dataApiUrl);

export const neonTest = neonTestConfigured
  ? createClient({
      auth: {
        adapter: BetterAuthReactAdapter(),
        url: authUrl
      },
      dataApi: {
        url: dataApiUrl
      }
    })
  : null;
