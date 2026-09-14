# Controle Simples — Fase 1

## Definição
Controle gerencial de faturamento bruto, sem contas a receber, despesas, caixa ou fluxo de caixa.

## Modos
- Total do mês
- Total por dia
- Cada receita

## Regras principais
- Receita significa faturamento bruto, não recebimento.
- Data da receita é a data da venda ou prestação do serviço.
- Mudança de modo vale a partir do mês seguinte e o histórico preserva o modo usado em cada período.
- Sem movimento é uma condição do fechamento, não um status isolado.
- Excluir corrige um lançamento que nunca deveria existir; cancelar/estornar preserva o fato histórico.
- Mês fechado pode ser reaberto pelo cliente com motivo obrigatório e notificação interna ao super admin.
- Cancelamento posterior de receita pertencente a mês histórico fechado gera ajuste negativo no mês atual sem reescrever o mês antigo.
- Cliente criado rapidamente durante um lançamento devolve o usuário ao formulário original com o rascunho preservado.
- Cliente sem qualquer receita pode ser excluído; com histórico, apenas inativado.

## Integração na Central existente
A raiz `/` agora usa um entrypoint adaptativo:
- super admin continua na Central Financeira V2 atual;
- cliente vinculado a organização com `control_tier = simple` entra diretamente no Controle Simples;
- outros clientes permanecem na experiência V2 atual.

A rota `/simples` permanece somente como rota auxiliar de validação. O produto não depende dela para o fluxo normal do cliente.

## Banco
A migração da Fase 1 foi aplicada apenas na branch Neon de testes. Não aplicar a estrutura V2/Controle Simples no Neon de produção antes da validação final de isolamento, permissões e fluxo real.

## Pendências posteriores
- importação Excel/CSV guiada;
- exportação PDF/Excel formatada;
- ações em massa;
- tratamento visual completo de duplicidades na importação;
- configuração administrativa mais refinada dos demais níveis de controle quando eles forem definidos.
