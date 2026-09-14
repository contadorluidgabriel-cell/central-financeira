# Controle Simples — Fase 1

## Propósito

Controle gerencial de faturamento para pequenos empresários, com alimentação simples e leitura detalhada. Receita significa faturamento bruto da venda ou serviço; não significa dinheiro recebido nem saldo em conta.

## Modos de lançamento

- Total do mês
- Total por dia
- Cada receita

A mudança de modo é programada para o mês seguinte. Meses concluídos preservam o modo utilizado no snapshot do fechamento. A interface usa esse snapshot ao consultar histórico e, quando ainda não existe fechamento, usa o modo gravado nos próprios lançamentos antes de recorrer à configuração atual.

## Regras principais

- valor bruto da venda ou serviço;
- data representa a data da venda/prestação;
- Consumidor final automático quando não há cliente identificado;
- categorias e meios de pagamento opcionais no modo Cada receita;
- faturamento bruto, ajustes e faturamento após ajustes são apresentados separadamente;
- excluir corrige lançamento que nunca deveria existir;
- cancelar/estornar preserva o fato histórico da venda;
- cancelamento posterior de mês já concluído gera ajuste negativo no mês atual e mantém o período antigo intacto;
- Sem movimento é condição do fechamento, não status independente;
- mês concluído fica bloqueado;
- reabertura exige motivo e gera notificação interna para o contador;
- cliente com histórico pode ser inativado, mas não apagado;
- cliente sem qualquer receita vinculada pode ser excluído;
- Consumidor final não pode ser excluído nem inativado.

## Fluxos reforçados nesta revisão

1. Login real por e-mail e senha com Neon Auth e tela alinhada ao padrão visual da Central.
2. Modo histórico respeitado na Home, Receitas, Relatórios e Fechamento.
3. Mudança de modo vencida é aplicada automaticamente ao abrir a Central, mesmo que o usuário não tenha acessado exatamente no primeiro dia do novo mês.
4. Cadastro rápido de cliente durante uma receita preserva o rascunho e retorna ao lançamento já com o novo cliente selecionado.
5. Receita de mês histórico concluído pode ser estornada diretamente pela tela de Receitas; o ajuste é criado no mês atual.
6. Cliente nunca utilizado ganhou exclusão explícita; cliente com histórico continua limitado a inativação.
7. Controles de ações receberam rótulos de acessibilidade em pontos críticos.
8. Fechamento como Sem movimento no mês corrente mostra alerta adicional antes da conclusão.

## Fora desta fase

- importação Excel/CSV guiada com revisão;
- exportação PDF/Excel formatada;
- ações em massa;
- tratamento visual completo de possíveis duplicidades em importação;
- integração definitiva dentro da rota principal da V2.

## Ambiente

O preview permanece na rota `/simples`, na branch `feat/controle-simples`, conectado apenas à branch Neon de testes. A rota principal `/` e o banco de produção permanecem inalterados.
