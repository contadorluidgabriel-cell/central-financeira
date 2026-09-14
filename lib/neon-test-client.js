'use client';

import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

// Endpoints públicos do branch Neon oficial de produção.
// Variáveis de ambiente continuam tendo prioridade quando existirem.
const authUrl =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
  'https://ep-summer-bird-aybs43vg.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth';

const dataApiUrl =
  process.env.NEXT_PUBLIC_NEON_DATA_API_URL ||
  'https://ep-summer-bird-aybs43vg.apirest.c-5.us-east-2.aws.neon.tech/neondb/rest/v1';

export const neonConfigured = Boolean(authUrl && dataApiUrl);

export const neon = neonConfigured
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

// Aliases temporários para compatibilidade com os componentes existentes.
// O backend referenciado por eles já é o branch oficial de produção.
export const neonTestConfigured = neonConfigured;
export const neonTest = neon;
