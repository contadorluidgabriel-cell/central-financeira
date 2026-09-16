'use client';

import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

// UAT integrado da V36: esta branch aponta deliberadamente para o backend QA.
// Variáveis de ambiente continuam tendo prioridade quando existirem.
const authUrl =
  process.env.NEXT_PUBLIC_NEON_AUTH_URL ||
  'https://ep-red-dust-ay8eyrl5.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth';

const dataApiUrl =
  process.env.NEXT_PUBLIC_NEON_DATA_API_URL ||
  'https://ep-red-dust-ay8eyrl5.apirest.c-5.us-east-2.aws.neon.tech/neondb/rest/v1';

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
// Nesta branch de homologação, ambos usam o backend QA da V36.
export const neonTestConfigured = neonConfigured;
export const neonTest = neon;
