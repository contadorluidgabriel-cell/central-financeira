# Controle Completo — Fase 1 + V3/V4

## Objetivo

Separar competência, obrigações e caixa sem perder rastreabilidade.

1. **Competência** — `financial_entries`: faturamento e despesas do período.
2. **Obrigações** — `finance_obligations`: contas a receber/pagar.
3. **Caixa** — `finance_settlements` + `finance_cash_movements`: dinheiro efetivamente movimentado.

Uma obrigação não altera novamente o resultado por competência.

## Controle Completo atual

- contas financeiras e saldo inicial;
- contas a receber/pagar;
- baixas parciais e totais;
- transferências e estornos;
- fluxo de caixa realizado + projetado;
- saldo acumulado e risco de caixa;
- histórico financeiro.

## V3

### Tela Hoje

Mostra saldo atual, vencidos, valores a receber/pagar nos próximos 7 dias e listas de vencidos, vencendo hoje e próximos compromissos.

### Detalhe da obrigação

Drawer com valor original, baixado, saldo, vencimento, contraparte, categoria, origem, observações, baixas e histórico de alterações.

### Edição segura

`update_finance_obligation_safe` permite alterar obrigações abertas/parciais, mas:

- exige motivo;
- não aceita valor abaixo do já baixado;
- respeita a alocação do `financial_entry` quando houver vínculo;
- registra antes/depois em `finance_obligation_revisions`;
- mantém isolamento por empresa.

### Extrato por conta

Exibe cada movimento em ordem cronológica com entrada, saída e saldo após o movimento.

## V4

### Parcelamentos

`finance_installment_plans_v2` agrupa parcelas. Cada parcela é uma obrigação real em `finance_obligations`.

Exemplo validado em QA: R$ 1.000 em 3x gerou R$ 333,34 + R$ 333,33 + R$ 333,33.

Cada parcela usa o motor normal de baixa, atraso, edição segura e estorno. O saldo restante do parcelamento pode ser cancelado sem apagar baixas já realizadas.

### Recorrências

`finance_recurring_rules_v2` define receitas/despesas mensais e gera obrigações normais. Vencimentos em dia 29/30/31 são ajustados automaticamente ao último dia de meses curtos.

QA validou recorrência no dia 31 em meses de 30 dias e em fevereiro. A geração possui lock transacional e proteção contra duplicidade; repetir o mesmo horizonte gera zero novas ocorrências. Uma recorrência pode ser estendida por novos meses ou encerrada, com opção de cancelar obrigações futuras ainda abertas.

## Fluxo de caixa acumulado

O saldo é recalculado depois de cada evento. No consolidado de todas as contas, transferências internas têm efeito líquido zero; ao filtrar uma conta específica, elas afetam o saldo daquela conta. Obrigações futuras alimentam a projeção consolidada e o sistema destaca o primeiro evento que deixa o caixa negativo e o menor saldo do período.

## Segurança

- RLS em todas as tabelas novas;
- `authenticated` tem leitura, mas não DML direto;
- operações compostas passam por RPCs `SECURITY DEFINER` com validação de organização;
- FKs compostas impedem referências cruzadas entre empresas;
- histórico e estornos são preservados; registros financeiros não são apagados pelo fluxo normal.

## QA V3/V4

- edição gera trilha antes/depois + motivo;
- redução do valor abaixo do total já baixado é rejeitada;
- parcelamento preserva centavos e cria obrigações independentes;
- cancelamento do saldo restante preserva valores já liquidados;
- recorrência dia 31 ajusta meses curtos corretamente;
- geração repetida não duplica ocorrências;
- encerramento pode cancelar obrigações futuras abertas;
- DML direto nas tabelas V3/V4 permanece bloqueado para `authenticated`.

## Ainda fora do escopo

- conciliação bancária/OFX;
- Open Finance;
- fechamento financeiro mensal separado da competência;
- cenários de simulação;
- IA financeira.
