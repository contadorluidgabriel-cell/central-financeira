# Central Financeira

Plataforma de acompanhamento financeiro para clientes do escritório Contador Luid Gabriel.

## Estado atual

- Aplicação migrada para React + Next.js
- Visual baseado no design system MED 12.1
- Usuário Master e visão do cliente
- Controle modular de receitas e despesas
- Confirmação de competência
- Categorias padrão e personalizadas por empresa
- Fechamento e bloqueio por competência
- Persistência local ainda mantida no painel principal
- Neon Auth + Data API ativos em ambiente isolado de teste
- RLS multiempresa em validação
- CI de build no GitHub Actions

## Estrutura

```text
app/
  globals.css
  layout.jsx
  page.jsx
  neon-test/
    page.jsx
components/
  CentralFinanceiraApp.jsx
  NeonTestPanel.jsx
lib/
  demo-data.js
  neon-test-client.js
```

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Painel atual: `http://localhost:3000`

Laboratório Neon: `http://localhost:3000/neon-test`

## Neon Test Lab

A rota `/neon-test` usa uma branch Neon isolada para validar o backend antes de substituir a persistência local do painel principal. Ela permite testar:

- cadastro e login via Neon Auth;
- criação e troca de organização;
- contexto de organização no JWT;
- escrita e leitura de `financial_entries` pela Data API;
- isolamento por RLS;
- confirmação da competência e bloqueio posterior de lançamentos.

Use somente informações fictícias nesse ambiente.

## Build

```bash
npm run build
```

## Próxima etapa

1. Validar o fluxo completo no `/neon-test`
2. Promover o usuário Master de teste na tabela `app_users`
3. Testar duas organizações e confirmar isolamento entre tenants
4. Integrar o painel principal à camada Neon
5. Remover `localStorage`
6. Publicar preview na Vercel

## Segurança

O painel principal ainda é demonstração. Não utilizar dados reais de clientes até que o fluxo Neon esteja validado, o `localStorage` seja removido e as políticas RLS definitivas sejam promovidas para `production`.
