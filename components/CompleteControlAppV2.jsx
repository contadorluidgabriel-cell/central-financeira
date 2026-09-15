'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CompleteControlAppV1 from './CompleteControlAppV1';
import { neonTest } from '../lib/neon-test-client';
import {
  loadCompleteControlData,
  localToday,
  normalizeCompleteError,
  reverseCompleteSettlement,
  reverseCompleteTransfer
} from '../lib/neon-complete-control';
import styles from './CompleteControlAppV2.module.css';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const dateBR = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const monthKey = date => String(date || '').slice(0, 7);
const monthNow = () => localToday().slice(0, 7);
const isTransferKind = kind => String(kind || '').startsWith('transfer_');
const directionLabel = direction => direction === 'in' ? 'Entrada' : 'Saída';

function Icon({ name }) {
  const paths = {
    cash: <><path d="M3 7h18v10H3z"/><path d="M7 11h.01M17 13h.01"/><circle cx="12" cy="12" r="2.4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    back: <path d="m15 18-6-6 6-6"/>,
    refresh: <><path d="M20 7h-5V2"/><path d="M20 7a8 8 0 1 0 1 8"/></>,
    undo: <><path d="m9 7-5 5 5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></>,
    arrowIn: <><path d="M12 3v14"/><path d="m7 12 5 5 5-5"/></>,
    arrowOut: <><path d="M12 21V7"/><path d="m7 12 5-5 5 5"/></>,
    transfer: <><path d="M4 7h14"/><path d="m14 3 4 4-4 4"/><path d="M20 17H6"/><path d="m10 13-4 4 4 4"/></>
  };
  return <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">{paths[name] || paths.cash}</svg>;
}

export default function CompleteControlAppV2() {
  const session = neonTest.auth.useSession();
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const user = session.data?.user || null;
  const [workspace, setWorkspace] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [baseVersion, setBaseVersion] = useState(0);
  const [reverseTarget, setReverseTarget] = useState(null);

  const refresh = useCallback(async () => {
    if (!user || !workspace) return;
    setLoading(true);
    setError('');
    try {
      const next = await loadCompleteControlData(activeOrganizationId);
      if (next.reload) { window.location.reload(); return; }
      setData(next);
    } catch (err) {
      setError(normalizeCompleteError(err));
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeOrganizationId, workspace]);

  useEffect(() => {
    if (workspace) refresh();
  }, [workspace, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function performReversal({ date, reason }) {
    if (!reverseTarget) return;
    setLoading(true);
    setError('');
    try {
      if (reverseTarget.type === 'settlement') {
        await reverseCompleteSettlement({ settlementId: reverseTarget.id, date, reason });
        setToast('Baixa estornada. O histórico foi preservado.');
      } else {
        await reverseCompleteTransfer({ transferId: reverseTarget.id, date, reason });
        setToast('Transferência estornada. Os movimentos compensatórios foram registrados.');
      }
      setReverseTarget(null);
      setBaseVersion(version => version + 1);
      const next = await loadCompleteControlData(activeOrganizationId);
      setData(next);
    } catch (err) {
      const message = normalizeCompleteError(err);
      setError(message);
      setToast(message);
    } finally {
      setLoading(false);
    }
  }

  return <div className={styles.root}>
    <CompleteControlAppV1 key={baseVersion}/>

    {!workspace && <div className={styles.launcher}>
      <button onClick={() => setWorkspace('cashflow')}><Icon name="cash"/><span><strong>Fluxo de caixa</strong><small>Realizado + projetado</small></span></button>
      <button onClick={() => setWorkspace('history')}><Icon name="history"/><span><strong>Histórico</strong><small>Baixas e estornos</small></span></button>
    </div>}

    {workspace && <FinanceWorkspace
      workspace={workspace}
      setWorkspace={setWorkspace}
      data={data}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onClose={() => setWorkspace(null)}
      onReverse={setReverseTarget}
    />}

    {reverseTarget && <ReverseModal target={reverseTarget} busy={loading} onClose={() => setReverseTarget(null)} onConfirm={performReversal}/>} 
    {toast && <div className={styles.toast}>{toast}</div>}
  </div>;
}

function FinanceWorkspace({ workspace, setWorkspace, data, loading, error, onRefresh, onClose, onReverse }) {
  const company = data?.companies.find(item => item.id === data?.companies?.[0]?.id) || data?.companies?.[0] || null;
  const companyId = company?.id || null;
  const accounts = useMemo(() => data?.accounts.filter(item => item.companyId === companyId) || [], [data, companyId]);
  const obligations = useMemo(() => data?.obligations.filter(item => item.companyId === companyId) || [], [data, companyId]);
  const settlements = useMemo(() => data?.settlements.filter(item => item.companyId === companyId) || [], [data, companyId]);
  const transfers = useMemo(() => data?.transfers.filter(item => item.companyId === companyId) || [], [data, companyId]);
  const movements = useMemo(() => data?.movements.filter(item => item.companyId === companyId) || [], [data, companyId]);

  return <div className={styles.overlay}>
    <section className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div className={styles.headerLeft}>
          <button className={styles.iconButton} onClick={onClose} title="Voltar ao Controle Completo"><Icon name="back"/></button>
          <div><span>Controle Completo</span><h1>{workspace === 'cashflow' ? 'Fluxo de caixa' : 'Histórico financeiro'}</h1><p>{workspace === 'cashflow' ? 'Dinheiro realizado e compromissos projetados, sem confundir transferência com receita ou despesa.' : 'Baixas e transferências com trilha de auditoria e estorno compensatório.'}</p></div>
        </div>
        <div className={styles.workspaceActions}>
          <div className={styles.switcher}><button className={workspace === 'cashflow' ? styles.selected : ''} onClick={() => setWorkspace('cashflow')}><Icon name="cash"/>Fluxo</button><button className={workspace === 'history' ? styles.selected : ''} onClick={() => setWorkspace('history')}><Icon name="history"/>Histórico</button></div>
          <button className={styles.iconButton} onClick={onRefresh} disabled={loading} title="Atualizar"><Icon name="refresh"/></button>
          <button className={styles.iconButton} onClick={onClose} title="Fechar"><Icon name="close"/></button>
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {!data && <div className={styles.loading}>{loading ? 'Carregando dados financeiros…' : 'Nenhum dado disponível.'}</div>}
      {data && workspace === 'cashflow' && <CashFlowView accounts={accounts} obligations={obligations} movements={movements} transfers={transfers}/>} 
      {data && workspace === 'history' && <HistoryView accounts={accounts} obligations={obligations} settlements={settlements} transfers={transfers} onReverse={onReverse}/>} 
    </section>
  </div>;
}

function CashFlowView({ accounts, obligations, movements, transfers }) {
  const [month, setMonth] = useState(monthNow());
  const [accountId, setAccountId] = useState('all');
  const currentBalance = accounts.filter(item => item.active).reduce((sum, item) => sum + item.balance, 0);

  const monthMovements = useMemo(() => movements.filter(item => monthKey(item.date) === month && (accountId === 'all' || item.accountId === accountId)), [movements, month, accountId]);
  const businessMovements = useMemo(() => monthMovements.filter(item => !isTransferKind(item.kind)), [monthMovements]);
  const projected = useMemo(() => obligations.filter(item => ['open','partial'].includes(item.status) && monthKey(item.dueDate) === month), [obligations, month]);
  const monthTransfers = useMemo(() => transfers.filter(item => monthKey(item.date) === month), [transfers, month]);

  const realizedIn = businessMovements.filter(item => item.direction === 'in').reduce((sum, item) => sum + item.amount, 0);
  const realizedOut = businessMovements.filter(item => item.direction === 'out').reduce((sum, item) => sum + item.amount, 0);
  const projectedIn = projected.filter(item => item.direction === 'receivable').reduce((sum, item) => sum + item.remaining, 0);
  const projectedOut = projected.filter(item => item.direction === 'payable').reduce((sum, item) => sum + item.remaining, 0);
  const projectedNet = projectedIn - projectedOut;
  const realizedNet = realizedIn - realizedOut;

  const timeline = useMemo(() => {
    const realizedRows = businessMovements.map(item => ({
      id: `m-${item.id}`,
      date: item.date,
      state: 'realized',
      direction: item.direction,
      description: item.description || directionLabel(item.direction),
      amount: item.amount,
      detail: accountName(accounts, item.accountId)
    }));
    const projectedRows = projected.map(item => ({
      id: `o-${item.id}`,
      date: item.dueDate,
      state: 'projected',
      direction: item.direction === 'receivable' ? 'in' : 'out',
      description: item.description,
      amount: item.remaining,
      detail: item.overdue ? 'Vencido' : 'Previsto'
    }));
    const transferRows = accountId === 'all' ? monthTransfers.map(item => ({
      id: `t-${item.id}`,
      date: item.date,
      state: 'transfer',
      direction: 'transfer',
      description: item.description || 'Transferência entre contas',
      amount: item.amount,
      detail: `${accountName(accounts, item.fromAccountId)} → ${accountName(accounts, item.toAccountId)}`
    })) : monthMovements.filter(item => isTransferKind(item.kind)).map(item => ({
      id: `tm-${item.id}`,
      date: item.date,
      state: 'transfer',
      direction: item.direction,
      description: item.description || 'Transferência',
      amount: item.amount,
      detail: directionLabel(item.direction)
    }));
    return [...realizedRows, ...projectedRows, ...transferRows].sort((a,b) => String(a.date).localeCompare(String(b.date)) || a.state.localeCompare(b.state));
  }, [businessMovements, projected, monthTransfers, monthMovements, accountId, accounts]);

  return <div className={styles.content}>
    <div className={styles.filters}>
      <label><span>Período</span><input type="month" value={month} onChange={e => setMonth(e.target.value)}/></label>
      <label><span>Conta para realizados</span><select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="all">Todas as contas</option>{accounts.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className={styles.filterNote}>A projeção considera todas as contas, porque um compromisso ainda não possui conta de liquidação definida.</div>
    </div>

    <section className={styles.metrics}>
      <Metric label="Saldo atual" value={money(currentBalance)} detail={`${accounts.filter(item => item.active).length} contas ativas`}/>
      <Metric label="Resultado de caixa realizado" value={money(realizedNet)} detail={`${money(realizedIn)} entrou • ${money(realizedOut)} saiu`} tone={realizedNet < 0 ? 'danger' : 'success'}/>
      <Metric label="Entradas projetadas" value={money(projectedIn)} detail="Saldo aberto com vencimento no mês"/>
      <Metric label="Saídas projetadas" value={money(projectedOut)} detail={`Projeção líquida: ${money(projectedNet)}`} tone={projectedNet < 0 ? 'danger' : 'neutral'}/>
    </section>

    <section className={styles.cashSummary}>
      <div><small>Leitura do período</small><strong>{money(realizedNet + projectedNet)}</strong><span>realizado + compromissos ainda abertos no mês</span></div>
      <div className={styles.legend}><span><i className={styles.realizedDot}></i>Realizado</span><span><i className={styles.projectedDot}></i>Projetado</span><span><i className={styles.transferDot}></i>Transferência interna</span></div>
    </section>

    <section className={styles.tablePanel}>
      <header><div><h2>Linha do caixa</h2><p>Transferências aparecem no histórico, mas não compõem entrada/saída do negócio quando todas as contas estão selecionadas.</p></div></header>
      {timeline.length ? <div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Situação</th><th>Descrição</th><th>Detalhe</th><th>Valor</th></tr></thead><tbody>{timeline.map(item => <tr key={item.id}><td>{dateBR(item.date)}</td><td><span className={`${styles.badge} ${item.state === 'projected' ? styles.badgeProjected : item.state === 'transfer' ? styles.badgeTransfer : styles.badgeRealized}`}>{item.state === 'projected' ? 'Projetado' : item.state === 'transfer' ? 'Transferência' : 'Realizado'}</span></td><td><strong>{item.description}</strong></td><td>{item.detail}</td><td className={item.direction === 'out' ? styles.amountOut : item.direction === 'in' ? styles.amountIn : ''}>{item.direction === 'out' ? '− ' : item.direction === 'in' ? '+ ' : ''}{money(item.amount)}</td></tr>)}</tbody></table></div> : <Empty title="Sem movimentos no período" text="Não há caixa realizado, compromissos previstos ou transferências para o mês selecionado."/>}
    </section>
  </div>;
}

function HistoryView({ accounts, obligations, settlements, transfers, onReverse }) {
  const [tab, setTab] = useState('settlements');
  const [direction, setDirection] = useState('all');
  const obligationById = useMemo(() => new Map(obligations.map(item => [item.id, item])), [obligations]);
  const filteredSettlements = useMemo(() => settlements.filter(item => {
    const obligation = obligationById.get(item.obligationId);
    return direction === 'all' || obligation?.direction === direction;
  }).sort((a,b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))), [settlements, obligationById, direction]);
  const sortedTransfers = useMemo(() => [...transfers].sort((a,b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))), [transfers]);

  const activeSettlements = settlements.filter(item => item.status === 'active');
  const received = activeSettlements.filter(item => obligationById.get(item.obligationId)?.direction === 'receivable').reduce((sum,item) => sum + item.amount, 0);
  const paid = activeSettlements.filter(item => obligationById.get(item.obligationId)?.direction === 'payable').reduce((sum,item) => sum + item.amount, 0);

  return <div className={styles.content}>
    <section className={styles.metrics}>
      <Metric label="Recebimentos ativos" value={money(received)} detail={`${activeSettlements.filter(item => obligationById.get(item.obligationId)?.direction === 'receivable').length} baixas`}/>
      <Metric label="Pagamentos ativos" value={money(paid)} detail={`${activeSettlements.filter(item => obligationById.get(item.obligationId)?.direction === 'payable').length} baixas`}/>
      <Metric label="Baixas estornadas" value={String(settlements.filter(item => item.status === 'reversed').length)} detail="Histórico mantido"/>
      <Metric label="Transferências" value={String(transfers.length)} detail={`${transfers.filter(item => item.status === 'reversed').length} estornadas`}/>
    </section>

    <div className={styles.historyTabs}>
      <button className={tab === 'settlements' ? styles.selected : ''} onClick={() => setTab('settlements')}>Baixas</button>
      <button className={tab === 'transfers' ? styles.selected : ''} onClick={() => setTab('transfers')}>Transferências</button>
    </div>

    {tab === 'settlements' && <section className={styles.tablePanel}>
      <header><div><h2>Histórico de baixas</h2><p>Cada pagamento ou recebimento permanece registrado mesmo quando é estornado.</p></div><select value={direction} onChange={e => setDirection(e.target.value)}><option value="all">Receber + pagar</option><option value="receivable">Recebimentos</option><option value="payable">Pagamentos</option></select></header>
      {filteredSettlements.length ? <div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Tipo</th><th>Obrigação</th><th>Conta</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody>{filteredSettlements.map(item => { const obligation = obligationById.get(item.obligationId); return <tr key={item.id}><td>{dateBR(item.date)}</td><td>{obligation?.direction === 'receivable' ? 'Recebimento' : 'Pagamento'}</td><td><strong>{obligation?.description || 'Obrigação removida'}</strong>{item.notes && <small>{item.notes}</small>}</td><td>{accountName(accounts,item.accountId)}</td><td><span className={`${styles.badge} ${item.status === 'reversed' ? styles.badgeMuted : styles.badgeRealized}`}>{item.status === 'reversed' ? 'Estornada' : 'Ativa'}</span>{item.reverseReason && <small>{item.reverseReason}</small>}</td><td>{money(item.amount)}</td><td>{item.status === 'active' && <button className={styles.reverseButton} onClick={() => onReverse({ type:'settlement', id:item.id, originalDate:item.date, title: obligation?.description || 'Baixa' })}><Icon name="undo"/>Estornar</button>}</td></tr>; })}</tbody></table></div> : <Empty title="Nenhuma baixa" text="Os recebimentos e pagamentos aparecerão aqui depois da primeira baixa."/>}
    </section>}

    {tab === 'transfers' && <section className={styles.tablePanel}>
      <header><div><h2>Histórico de transferências</h2><p>Transferências movimentam contas, mas não alteram faturamento nem despesas.</p></div></header>
      {sortedTransfers.length ? <div className={styles.tableWrap}><table><thead><tr><th>Data</th><th>Origem</th><th>Destino</th><th>Descrição</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody>{sortedTransfers.map(item => <tr key={item.id}><td>{dateBR(item.date)}</td><td>{accountName(accounts,item.fromAccountId)}</td><td>{accountName(accounts,item.toAccountId)}</td><td><strong>{item.description || 'Transferência'}</strong>{item.reverseReason && <small>{item.reverseReason}</small>}</td><td><span className={`${styles.badge} ${item.status === 'reversed' ? styles.badgeMuted : styles.badgeTransfer}`}>{item.status === 'reversed' ? 'Estornada' : 'Ativa'}</span></td><td>{money(item.amount)}</td><td>{item.status === 'active' && <button className={styles.reverseButton} onClick={() => onReverse({ type:'transfer', id:item.id, originalDate:item.date, title:item.description || 'Transferência' })}><Icon name="undo"/>Estornar</button>}</td></tr>)}</tbody></table></div> : <Empty title="Nenhuma transferência" text="As transferências entre contas aparecerão aqui."/>}
    </section>}
  </div>;
}

function ReverseModal({ target, busy, onClose, onConfirm }) {
  const [date, setDate] = useState(localToday());
  const [reason, setReason] = useState('');
  const minDate = String(target.originalDate || '').slice(0,10) || undefined;
  return <div className={styles.modalBackdrop} onMouseDown={event => event.target === event.currentTarget && onClose()}><section className={styles.modal}><header><div><span>Estorno</span><h2>{target.type === 'settlement' ? 'Estornar baixa' : 'Estornar transferência'}</h2><p>{target.title}</p></div><button onClick={onClose}><Icon name="close"/></button></header><form onSubmit={event => { event.preventDefault(); onConfirm({ date, reason }); }}><label><span>Data do estorno</span><input required type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)}/></label><label><span>Motivo</span><textarea required rows="4" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explique por que este movimento precisa ser estornado"/></label><div className={styles.modalNote}>O registro original não será apagado. O sistema criará um movimento compensatório e manterá a trilha de auditoria.</div><footer><button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Voltar</button><button className={styles.danger} disabled={busy}>{busy ? 'Estornando…' : 'Confirmar estorno'}</button></footer></form></section></div>;
}

function Metric({ label, value, detail, tone = 'neutral' }) {
  return <article className={`${styles.metric} ${tone === 'danger' ? styles.metricDanger : tone === 'success' ? styles.metricSuccess : ''}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}

function Empty({ title, text }) {
  return <div className={styles.empty}><strong>{title}</strong><p>{text}</p></div>;
}

function accountName(accounts, id) {
  return accounts.find(item => item.id === id)?.name || 'Conta não encontrada';
}
