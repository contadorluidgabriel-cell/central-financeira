# Central Financeira

Plataforma de acompanhamento financeiro para clientes do escritório Contador Luid Gabriel.

## Estado atual

- Aplicação oficial em React + Next.js
- Visual baseado no design system MED 12.1
- Controle Simples publicado
- Controle Básico publicado
- Receitas, despesas, clientes e fornecedores
- Importação CSV/XLSX com prévia e validação
- Relatórios CSV, Excel e PDF
- Fechamento, reabertura e histórico por competência
- Neon Auth + Data API no branch oficial `production`
- RLS multiempresa aplicada na estrutura atual
- CI de build no GitHub Actions
- Deploy oficial na Vercel

## Produção

Aplicação oficial:

`https://centralfinanceira-peach.vercel.app`

Rotas principais:

- `/` — entrada e roteamento da Central
- `/simples` — Controle Simples
- `/basico` — Controle Básico

O branch Neon oficial é o branch padrão `production`. O antigo branch vazio de produção foi preservado como `production-legacy-empty` e existe também um backup anterior à promoção.

## Estrutura atual

```text
app/
  page.jsx
  simples/page.jsx
  basico/page.jsx
components/
  CentralFinanceiraEntry.jsx
  SimpleControlAppV2.jsx
  BasicControlAppV1.jsx
lib/
  neon-test-client.js
  neon-simple-control.js
  neon-basic-control.js
migrations/
  20260913_controle_simples.sql
  20260913_controle_simples_integrity.sql
  20260914_controle_basico.sql
```

> `lib/neon-test-client.js` mantém o nome histórico apenas por compatibilidade interna. Seus endpoints padrão já apontam para o branch Neon oficial de produção.

## Próxima etapa

O próximo bloco de produto é concluir o acesso do cliente:

1. criação de acesso pelo administrador;
2. senha provisória;
3. troca obrigatória no primeiro acesso;
4. redefinição de senha;
5. bloqueio e reativação;
6. vínculo seguro entre usuário e organização;
7. auditoria final de isolamento multiempresa antes do uso com dados reais de clientes.

## Segurança

O código e a infraestrutura atuais estão oficializados, mas o fluxo completo de acesso do cliente ainda precisa ser concluído e auditado antes de liberar dados reais de clientes. O repositório também deve ser mantido sem segredos; apenas endpoints públicos podem aparecer no código cliente.
