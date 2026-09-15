'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import { bootstrapBasicOrganization } from '../lib/neon-basic-control';
import {
  cancelCompleteObligation,
  createCompleteAccount,
  createCompleteObligation,
  createCompleteTransfer,
  loadCompleteControlData,
  localToday,
  normalizeCompleteError,
  settleCompleteObligation
} from '../lib/neon-complete-control';
import styles from './CompleteControlApp.module.css';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const dateBR = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const kindLabel = value => ({ bank: 'Banco', cash: 'Caixa', wallet: 'Carteira digital', other: 'Outra conta' })[value] || value;
const statusLabel = value => ({ open: 'Em aberto', partial: 'Parcial', settled: 'Quitado', cancelled: 'Cancelado', overdue: 'Vencido' })[value] || value;

function Icon({ name }) {
  const paths = {
    home: <><path d="M3 11 12 3l9 8"/><path d="M5 10v11h14V10"/></>,
    wallet: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M16 10h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    in: <><path d="M12 3v14"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></>,
    out: <><path d="M12 21V7"/><path d="m7 12 5-5 5 5"/><path d="M5 3h14"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    transfer: <><path d="M4 7h14"/><path d="m14 3 4 4-4 4"/><path d="M20 17H6"/><path d="m10 13-4 4 4 4"/></>,
    logout: <><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>
  };
  return <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">{paths[name] || paths.home}</svg>;
}

export default function CompleteControlAppV1() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [state, setState] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [view, setView] = useState('overview');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [bootstrapped, setBootstrapped] = useState({});

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const data = await loadCompleteControlData(activeOrganizationId);
      if (data.reload) { window.location.reload(); return; }
      setState(data);
      setSelectedCompanyId(current => current && data.companies.some(company => company.id === current) ? current : (data.companies[0]?.id || null));
    } catch (err) {
      setError(normalizeCompleteError(err));
    }
  }, [user?.id, activeOrganizationId]);

  useEffect(() => {
    if (session.isPending) return;
    if (!user) { setState(null); return; }
    refresh();
  }, [session.isPending, user?.id, refresh]);

  const company = state?.companies.find(item => item.id === selectedCompanyId) || null;

  useEffect(() => {
    if (!company || bootstrapped[company.id]) return;
    let cancelled = false;
    (async () => {
      try {
        await bootstrapBasicOrganization(company.id);
        if (!cancelled) setBootstrapped(prev => ({ ...prev, [company.id]: true }));
      } catch (err) {
        if (!cancelled) setError(normalizeCompleteError(err));
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  const accounts = useMemo(() => state?.accounts.filter(item => item.companyId === selectedCompanyId) || [], [state, selectedCompanyId]);
  const obligations = useMemo(() => state?.obligations.filter(item => item.companyId === selectedCompanyId) || [], [state, selectedCompanyId]);
  const customers = useMemo(() => state?.customers.filter(item => item.organization_id === selectedCompanyId && item.active && !item.merged_into) || [], [state, selectedCompanyId]);
  const suppliers = useMemo(() => state?.suppliers.filter(item => item.organization_id === selectedCompanyId && item.active && !item.merged_into) || [], [state, selectedCompanyId]);
  const categories = useMemo(() => state?.categories.filter(item => item.organization_id === selectedCompanyId && item.active) || [], [state, selectedCompanyId]);

  const summary = useMemo(() => {
    const activeAccounts = accounts.filter(item => item.active);
    const open = obligations.filter(item => ['open', 'partial'].includes(item.status));
    return {
      balance: activeAccounts.reduce((sum, item) => sum + item.balance, 0),
      receivable: open.filter(item => item.direction === 'receivable').reduce((sum, item) => sum + item.remaining, 0),
      payable: open.filter(item => item.direction === 'payable').reduce((sum, item) => sum + item.remaining, 0),
      overdue: open.filter(item => item.overdue).reduce((sum, item) => sum + item.remaining, 0)
    };
  }, [accounts, obligations]);

  async function run(action, success) {
    setBusy(true); setError('');
    try {
      await action();
      await refresh();
      setModal(null);
      if (success) setToast(success);
    } catch (err) {
      const message = normalizeCompleteError(err);
      setError(message); setToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); } finally { window.location.reload(); }
  }

  if (session.isPending || !state) return <Center text="Carregando Controle Completo…"/>;
  if (!company) return <Center text="Nenhuma empresa disponível para este acesso."/>;

  const visibleObligations = view === 'receivables'
    ? obligations.filter(item => item.direction === 'receivable')
    : view === 'payables'
      ? obligations.filter(item => item.direction === 'payable')
      : obligations;

  return <div className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span>LG</span><div><strong>Central Financeira</strong><small>Controle Completo</small></div></div>
      <nav className={styles.nav}>
        <button className={view === 'overview' ? styles.active : ''} onClick={() => setView('overview')}><Icon name="home"/>Visão geral</button>
        <button className={view === 'accounts' ? styles.active : ''} onClick={() => setView('accounts')}><Icon name="wallet"/>Contas</button>
        <button className={view === 'receivables' ? styles.active : ''} onClick={() => setView('receivables')}><Icon name="in"/>A receber</button>
        <button className={view === 'payables' ? styles.active : ''} onClick={() => setView('payables')}><Icon name="out"/>A pagar</button>
      </nav>
      <div className={styles.sidebarFoot}>
        <div><small>Empresa</small><strong>{company.name}</strong></div>
        <button onClick={signOut} disabled={busy}><Icon name="logout"/>Sair</button>
      </div>
    </aside>

    <main className={styles.main}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Controle Completo</span><h1>{viewTitle(view)}</h1><p>{viewDescription(view)}</p></div>
        <div className={styles.headerActions}>
          {view === 'accounts' && <><button className={styles.secondary} onClick={() => setModal({ type: 'transfer' })}><Icon name="transfer"/>Transferir</button><button className={styles.primary} onClick={() => setModal({ type: 'account' })}><Icon name="plus"/>Nova conta</button></>}
          {view === 'receivables' && <button className={styles.primary} onClick={() => setModal({ type: 'obligation', direction: 'receivable' })}><Icon name="plus"/>Nova conta a receber</button>}
          {view === 'payables' && <button className={styles.primary} onClick={() => setModal({ type: 'obligation', direction: 'payable' })}><Icon name="plus"/>Nova conta a pagar</button>}
        </div>
      </header>

      {error && <div className={styles.error}>{error}</div>}
      {toast && <div className={styles.toast}>{toast}</div>}

      {view === 'overview' && <>
        <section className={styles.metrics}>
          <Metric label="Saldo financeiro" value={money(summary.balance)} detail={`${accounts.filter(item => item.active).length} contas ativas`}/>
          <Metric label="A receber" value={money(summary.receivable)} detail="Saldo ainda não recebido"/>
          <Metric label="A pagar" value={money(summary.payable)} detail="Saldo ainda não pago"/>
          <Metric label="Vencidos" value={money(summary.overdue)} detail="Receber + pagar em atraso" critical={summary.overdue > 0}/>
        </section>
        <section className={styles.grid2}>
          <Panel title="Contas e saldos" action={<button className={styles.linkButton} onClick={() => setView('accounts')}>Ver contas</button>}>
            {accounts.length ? <div className={styles.accountList}>{accounts.slice(0, 5).map(account => <AccountRow key={account.id} account={account}/>)}</div> : <Empty title="Nenhuma conta financeira" text="Cadastre a primeira conta para começar a controlar o caixa." action={<button className={styles.primary} onClick={() => setModal({ type: 'account' })}>Cadastrar conta</button>}/>} 
          </Panel>
          <Panel title="Próximos compromissos" action={<button className={styles.linkButton} onClick={() => setView('payables')}>Ver a pagar</button>}>
            <ObligationMiniList items={[...obligations].filter(item => ['open','partial'].includes(item.status)).sort((a,b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 6)} onSettle={item => setModal({ type: 'settlement', obligation: item })}/>
          </Panel>
        </section>
      </>}

      {view === 'accounts' && <Panel title="Contas financeiras" subtitle="Saldo inicial + movimentações efetivamente realizadas.">
        {accounts.length ? <div className={styles.accountGrid}>{accounts.map(account => <article className={styles.accountCard} key={account.id}><div className={styles.accountTop}><span className={styles.accountIcon}><Icon name="wallet"/></span><span className={account.active ? styles.liveBadge : styles.mutedBadge}>{account.active ? 'Ativa' : 'Inativa'}</span></div><strong>{account.name}</strong><small>{kindLabel(account.kind)}{account.institution ? ` • ${account.institution}` : ''}</small><div className={styles.accountBalance}>{money(account.balance)}</div><footer><span>Saldo inicial {money(account.openingBalance)}</span><span>desde {dateBR(account.openingDate)}</span></footer></article>)}</div> : <Empty title="Nenhuma conta cadastrada" text="Inclua banco, caixa ou carteira digital."/>}
      </Panel>}

      {(view === 'receivables' || view === 'payables') && <Panel title={view === 'receivables' ? 'Contas a receber' : 'Contas a pagar'} subtitle="Competência e caixa ficam separados: a obrigação não altera novamente o resultado.">
        <ObligationTable items={visibleObligations} onSettle={item => setModal({ type: 'settlement', obligation: item })} onCancel={item => setModal({ type: 'cancel', obligation: item })}/>
      </Panel>}
    </main>

    {modal?.type === 'account' && <AccountModal busy={busy} onClose={() => setModal(null)} onSave={form => run(() => createCompleteAccount({ organizationId: company.id, ...form }), 'Conta criada.')} />}
    {modal?.type === 'obligation' && <ObligationModal direction={modal.direction} customers={customers} suppliers={suppliers} categories={categories.filter(item => item.type === (modal.direction === 'receivable' ? 'revenue' : 'expense'))} busy={busy} onClose={() => setModal(null)} onSave={form => run(() => createCompleteObligation({ organizationId: company.id, direction: modal.direction, ...form }), modal.direction === 'receivable' ? 'Conta a receber criada.' : 'Conta a pagar criada.')} />}
    {modal?.type === 'settlement' && <SettlementModal obligation={modal.obligation} accounts={accounts.filter(item => item.active)} busy={busy} onClose={() => setModal(null)} onSave={form => run(() => settleCompleteObligation({ obligationId: modal.obligation.id, ...form }), modal.obligation.direction === 'receivable' ? 'Recebimento registrado.' : 'Pagamento registrado.')} />}
    {modal?.type === 'transfer' && <TransferModal accounts={accounts.filter(item => item.active)} busy={busy} onClose={() => setModal(null)} onSave={form => run(() => createCompleteTransfer({ organizationId: company.id, ...form }), 'Transferência registrada.')} />}
    {modal?.type === 'cancel' && <CancelModal obligation={modal.obligation} busy={busy} onClose={() => setModal(null)} onSave={reason => run(() => cancelCompleteObligation({ obligationId: modal.obligation.id, reason }), 'Obrigação cancelada.')} />}
  </div>;
}

function viewTitle(view) {
  return ({ overview: 'Visão geral', accounts: 'Contas financeiras', receivables: 'Contas a receber', payables: 'Contas a pagar' })[view] || 'Controle Completo';
}
function viewDescription(view) {
  return ({ overview: 'Resultado, compromissos e caixa sem misturar conceitos.', accounts: 'Onde o dinheiro realmente está.', receivables: 'Direitos de recebimento e baixas.', payables: 'Compromissos, vencimentos e pagamentos.' })[view] || '';
}
function Center({ text }) { return <div className={styles.center}>{text}</div>; }
function Metric({ label, value, detail, critical }) { return <article className={`${styles.metric} ${critical ? styles.metricCritical : ''}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>; }
function Panel({ title, subtitle, action, children }) { return <section className={styles.panel}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>; }
function Empty({ title, text, action }) { return <div className={styles.empty}><strong>{title}</strong><p>{text}</p>{action}</div>; }
function AccountRow({ account }) { return <div className={styles.accountRow}><span className={styles.accountIcon}><Icon name="wallet"/></span><div><strong>{account.name}</strong><small>{kindLabel(account.kind)}</small></div><b>{money(account.balance)}</b></div>; }

function ObligationMiniList({ items, onSettle }) {
  if (!items.length) return <Empty title="Tudo em dia" text="Nenhuma obrigação aberta neste momento."/>;
  return <div className={styles.miniList}>{items.map(item => <button key={item.id} onClick={() => onSettle(item)}><span className={item.overdue ? styles.dotCritical : styles.dot}></span><div><strong>{item.description}</strong><small>{dateBR(item.dueDate)} • {statusLabel(item.displayStatus)}</small></div><b>{money(item.remaining)}</b></button>)}</div>;
}

function ObligationTable({ items, onSettle, onCancel }) {
  if (!items.length) return <Empty title="Nenhum lançamento" text="Cadastre a primeira obrigação para iniciar o acompanhamento."/>;
  return <div className={styles.tableWrap}><table><thead><tr><th>Descrição</th><th>Vencimento</th><th>Status</th><th>Valor</th><th>Baixado</th><th>Em aberto</th><th></th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.description}</strong><small>{item.origin === 'opening' ? 'Saldo de abertura' : item.origin === 'financial_entry' ? 'Vinculado à competência' : 'Manual'}</small></td><td>{dateBR(item.dueDate)}</td><td><span className={`${styles.status} ${item.overdue ? styles.statusCritical : ''}`}>{statusLabel(item.displayStatus)}</span></td><td>{money(item.originalAmount)}</td><td>{money(item.settledAmount)}</td><td><strong>{money(item.remaining)}</strong></td><td><div className={styles.rowActions}>{['open','partial'].includes(item.status) && <button onClick={() => onSettle(item)}>Baixar</button>}{['open','partial'].includes(item.status) && <button className={styles.dangerLink} onClick={() => onCancel(item)}>Cancelar</button>}</div></td></tr>)}</tbody></table></div>;
}

function Modal({ title, description, onClose, children }) { return <div className={styles.backdrop} onMouseDown={event => event.target === event.currentTarget && onClose()}><section className={styles.modal}><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button className={styles.close} onClick={onClose}><Icon name="close"/></button></header>{children}</section></div>; }
function Field({ label, children }) { return <label className={styles.field}><span>{label}</span>{children}</label>; }

function AccountModal({ busy, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', kind: 'bank', institution: '', openingBalance: '', openingDate: localToday() });
  const patch = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  return <Modal title="Nova conta financeira" description="O saldo inicial cria o ponto de partida sem inventar histórico." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSave(form); }} className={styles.form}><Field label="Nome da conta"><input required value={form.name} onChange={e => patch('name', e.target.value)} placeholder="Ex.: Banco Inter"/></Field><div className={styles.formGrid}><Field label="Tipo"><select value={form.kind} onChange={e => patch('kind', e.target.value)}><option value="bank">Banco</option><option value="cash">Caixa</option><option value="wallet">Carteira digital</option><option value="other">Outra</option></select></Field><Field label="Instituição"><input value={form.institution} onChange={e => patch('institution', e.target.value)} placeholder="Opcional"/></Field></div><div className={styles.formGrid}><Field label="Saldo inicial"><input required type="number" step="0.01" value={form.openingBalance} onChange={e => patch('openingBalance', e.target.value)}/></Field><Field label="Data do saldo"><input required type="date" value={form.openingDate} onChange={e => patch('openingDate', e.target.value)}/></Field></div><ModalActions busy={busy} onClose={onClose}/></form></Modal>;
}

function ObligationModal({ direction, customers, suppliers, categories, busy, onClose, onSave }) {
  const [form, setForm] = useState({ origin: 'manual', description: '', issueDate: localToday(), dueDate: localToday(), amount: '', customerId: '', supplierId: '', categoryId: '', notes: '' });
  const patch = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const counterparties = direction === 'receivable' ? customers : suppliers;
  return <Modal title={direction === 'receivable' ? 'Nova conta a receber' : 'Nova conta a pagar'} description="Use saldo de abertura para valores que já existiam antes do Controle Completo." onClose={onClose}><form className={styles.form} onSubmit={event => { event.preventDefault(); onSave({ ...form, customerId: direction === 'receivable' ? form.customerId || null : null, supplierId: direction === 'payable' ? form.supplierId || null : null, categoryId: form.categoryId || null }); }}><div className={styles.formGrid}><Field label="Origem"><select value={form.origin} onChange={e => patch('origin', e.target.value)}><option value="manual">Novo compromisso</option><option value="opening">Saldo de abertura</option></select></Field><Field label={direction === 'receivable' ? 'Cliente' : 'Fornecedor'}><select value={direction === 'receivable' ? form.customerId : form.supplierId} onChange={e => patch(direction === 'receivable' ? 'customerId' : 'supplierId', e.target.value)}><option value="">Não informado</option>{counterparties.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><Field label="Descrição"><input required value={form.description} onChange={e => patch('description', e.target.value)} placeholder={direction === 'receivable' ? 'Ex.: Serviço mensal' : 'Ex.: Aluguel'}/></Field><div className={styles.formGrid}><Field label="Emissão"><input type="date" value={form.issueDate} onChange={e => patch('issueDate', e.target.value)}/></Field><Field label="Vencimento"><input required type="date" value={form.dueDate} onChange={e => patch('dueDate', e.target.value)}/></Field></div><div className={styles.formGrid}><Field label="Valor"><input required min="0.01" type="number" step="0.01" value={form.amount} onChange={e => patch('amount', e.target.value)}/></Field><Field label="Categoria"><select value={form.categoryId} onChange={e => patch('categoryId', e.target.value)}><option value="">Sem categoria</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><Field label="Observação"><textarea value={form.notes} onChange={e => patch('notes', e.target.value)} rows="3"/></Field><ModalActions busy={busy} onClose={onClose}/></form></Modal>;
}

function SettlementModal({ obligation, accounts, busy, onClose, onSave }) {
  const [form, setForm] = useState({ accountId: accounts[0]?.id || '', date: localToday(), amount: obligation.remaining, notes: '' });
  const patch = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  return <Modal title={obligation.direction === 'receivable' ? 'Registrar recebimento' : 'Registrar pagamento'} description={`${obligation.description} • saldo ${money(obligation.remaining)}`} onClose={onClose}>{accounts.length ? <form className={styles.form} onSubmit={event => { event.preventDefault(); onSave(form); }}><Field label="Conta financeira"><select required value={form.accountId} onChange={e => patch('accountId', e.target.value)}>{accounts.map(item => <option value={item.id} key={item.id}>{item.name} • {money(item.balance)}</option>)}</select></Field><div className={styles.formGrid}><Field label="Data"><input required type="date" value={form.date} onChange={e => patch('date', e.target.value)}/></Field><Field label="Valor"><input required type="number" min="0.01" max={obligation.remaining} step="0.01" value={form.amount} onChange={e => patch('amount', e.target.value)}/></Field></div><Field label="Observação"><input value={form.notes} onChange={e => patch('notes', e.target.value)} placeholder="Opcional"/></Field><ModalActions busy={busy} onClose={onClose}/></form> : <Empty title="Cadastre uma conta primeiro" text="A baixa precisa indicar onde o dinheiro entrou ou saiu."/>}</Modal>;
}

function TransferModal({ accounts, busy, onClose, onSave }) {
  const [form, setForm] = useState({ fromAccountId: accounts[0]?.id || '', toAccountId: accounts[1]?.id || '', date: localToday(), amount: '', description: '' });
  const patch = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  return <Modal title="Transferir entre contas" description="Transferência não é receita nem despesa." onClose={onClose}>{accounts.length >= 2 ? <form className={styles.form} onSubmit={event => { event.preventDefault(); onSave(form); }}><div className={styles.formGrid}><Field label="Conta de origem"><select required value={form.fromAccountId} onChange={e => patch('fromAccountId', e.target.value)}>{accounts.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Conta de destino"><select required value={form.toAccountId} onChange={e => patch('toAccountId', e.target.value)}>{accounts.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field></div><div className={styles.formGrid}><Field label="Data"><input required type="date" value={form.date} onChange={e => patch('date', e.target.value)}/></Field><Field label="Valor"><input required min="0.01" type="number" step="0.01" value={form.amount} onChange={e => patch('amount', e.target.value)}/></Field></div><Field label="Descrição"><input value={form.description} onChange={e => patch('description', e.target.value)} placeholder="Opcional"/></Field><ModalActions busy={busy} onClose={onClose}/></form> : <Empty title="São necessárias duas contas" text="Cadastre pelo menos duas contas para realizar uma transferência."/>}</Modal>;
}

function CancelModal({ obligation, busy, onClose, onSave }) {
  const [reason, setReason] = useState('');
  return <Modal title="Cancelar obrigação" description={`O histórico já baixado (${money(obligation.settledAmount)}) será preservado.`} onClose={onClose}><form className={styles.form} onSubmit={event => { event.preventDefault(); onSave(reason); }}><Field label="Motivo"><textarea required rows="4" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explique o motivo do cancelamento"/></Field><ModalActions busy={busy} onClose={onClose} danger/></form></Modal>;
}

function ModalActions({ busy, onClose, danger = false }) { return <footer className={styles.modalActions}><button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Voltar</button><button className={danger ? styles.danger : styles.primary} disabled={busy}>{busy ? 'Salvando…' : danger ? 'Cancelar obrigação' : 'Salvar'}</button></footer>; }
