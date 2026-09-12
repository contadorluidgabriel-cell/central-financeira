'use client';

import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

const authUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

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
