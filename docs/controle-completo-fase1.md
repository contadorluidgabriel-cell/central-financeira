# Controle Completo — Fase 1

## Objetivo

Adicionar controle financeiro operacional sem misturar três conceitos diferentes:

1. **Competência** — `financial_entries`: o que a empresa faturou/gastou no período.
2. **Obrigações** — `finance_obligations`: o que ainda precisa ser recebido ou pago.
3. **Caixa** — `finance_settlements` + `finance_cash_movements`: o dinheiro que efetivamente entrou ou saiu.

Uma conta a receber ou pagar nunca deve alterar novamente o resultado por competência.

## Herança dos níveis

- **Simples:** faturamento.
- **Básico:** faturamento + despesas + resultado gerencial.
- **Completo:** tudo do Básico + contas financeiras + receber/pagar + baixas + transferências + fluxo de caixa.

A mudança de nível não reinterpreta períodos anteriores.

## Entrada no Controle Completo

Ao iniciar o Completo, o cliente informa:

- saldo inicial de cada conta financeira;
- data do saldo inicial;
- valores antigos a receber/pagar, quando existirem, com `origin = opening`.

Saldos de abertura entram no financeiro, mas não criam `financial_entries` e não alteram o resultado do mês.

## Tabelas da Fase 1

### `finance_accounts`

Contas bancárias, caixa, carteiras digitais e outras contas. O saldo é:

`opening_balance + entradas de caixa - saídas de caixa`.

O saldo inicial não gera uma receita/despesa fictícia.

### `finance_obligations`

Contas a receber/pagar. Origens:

- `manual`;
- `financial_entry`;
- `opening`.

Quando vinculada a `financial_entry`, a soma alocada não pode ultrapassar o valor do lançamento original. Em obrigação cancelada, somente o valor efetivamente liquidado continua consumindo a alocação.

### `finance_settlements`

Cada baixa é um registro próprio. Uma obrigação de R$ 1.000 pode ter, por exemplo, três baixas de R$ 400, R$ 300 e R$ 300 sem sobrescrever histórico.

### `finance_cash_movements`

Ledger de caixa gerado somente pelas RPCs. Não aceita escrita direta do usuário autenticado.

### `finance_transfers`

Transferência entre contas gera uma saída e uma entrada de mesmo valor. Não é receita nem despesa.

## Fluxo de caixa acumulado

O Controle Completo recalcula o saldo após cada evento do período:

`saldo acumulado anterior + entrada - saída`.

No consolidado de **Todas as contas**:

- parte do saldo existente no início do período;
- incorpora saldos iniciais de contas abertas dentro do mês;
- incorpora recebimentos e pagamentos realizados;
- incorpora contas a receber/pagar ainda abertas como projeção;
- mostra transferências internas, mas elas têm efeito líquido zero no saldo consolidado;
- calcula o menor saldo do período;
- identifica o primeiro ponto em que o saldo projetado fica negativo.

Quando uma conta específica é filtrada:

- o acumulado considera somente os movimentos realizados naquela conta;
- transferências passam a afetar o saldo da conta de origem/destino;
- obrigações futuras continuam visíveis nos totais da empresa, mas não são somadas ao saldo daquela conta porque ainda não possuem conta de liquidação definida.

Para mês futuro, obrigações abertas com vencimento anterior ao mês selecionado são consideradas no saldo projetado de abertura. No mês atual, obrigações vencidas de meses anteriores entram como risco projetado na data atual.

## Atomicidade

Operações críticas devem acontecer em uma única transação PostgreSQL.

### Baixa

1. trava a obrigação;
2. confere saldo em aberto;
3. valida a conta e a data;
4. cria `finance_settlements`;
5. cria o movimento de caixa;
6. atualiza `settled_amount` e status;
7. commit.

Se qualquer etapa falhar, nada é persistido.

### Transferência

1. valida/trava as duas contas;
2. cria a transferência;
3. cria saída na origem;
4. cria entrada no destino;
5. commit.

## Segurança

- todas as tabelas novas usam `organization_id`;
- referências críticas usam FKs compostas `(id, organization_id)` para impedir vínculo entre empresas;
- `authenticated` possui apenas `SELECT` nas tabelas da Fase 1;
- `INSERT/UPDATE/DELETE` diretos são revogados;
- alterações ocorrem via RPCs `SECURITY DEFINER` que validam `auth.uid()` + `can_access_organization`;
- estornos geram movimentos compensatórios; histórico não é apagado.

## Regras de data

- baixa não pode ser anterior à data de abertura da conta;
- estorno de baixa não pode ser anterior à baixa original;
- transferência não pode ser anterior à abertura das contas;
- estorno de transferência não pode ser anterior à transferência original;
- vencimento não pode ser anterior à emissão.

## Fora da Fase 1

Ficam para fases posteriores:

- recorrências automáticas;
- orçamento/metas;
- conciliação bancária/OFX;
- integração bancária;
- projeções avançadas/IA;
- parcelamentos como agrupador próprio de obrigações.
