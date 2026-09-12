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
- Persistência local temporária
- CI de build no GitHub Actions

## Estrutura

```text
app/
  globals.css
  layout.jsx
  page.jsx
components/
  CentralFinanceiraApp.jsx
lib/
  demo-data.js
legacy/
  (protótipo estático mantido temporariamente na raiz atual)
```

## Rodar localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Próxima etapa

1. Integrar Supabase Auth
2. Criar schema PostgreSQL multiempresa
3. Implementar RLS por organização
4. Substituir `localStorage` por camada de dados real
5. Publicar preview na Vercel

## Segurança

A versão atual ainda é demonstração. Não utilizar dados reais de clientes até a autenticação, RLS e persistência no Supabase estarem concluídas.
