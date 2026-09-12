'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_REVENUE_CATEGORIES,
  nextMonth,
  previousMonth
} from '../lib/demo-data';
import { neonTest } from '../lib/neon-test-client';
import {
  addCategory as addNeonCategory,
  confirmMonth,
  createCompany as createNeonCompany,
  deactivateCategory,
  deleteFinancialEntry,
  ensureCategory,
  loadCentralData,
  normalizeError,
  reopenMonthSubmission,
  reopenMonthlyClosing,
  saveFinancialEntry,
  saveMonthlyClosing,
  updateCompanyMetadata,
  updateOrganizationSettings
} from '../lib/neon-live-data';

const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const monthName = key => {
  const [y,m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).replace(/^./, c => c.toUpperCase());
};
const formatDate = date => date ? String(date).slice(0,10).split('-').reverse().join('/') : '—';
const initials = name => String(name || 'LG').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const modeName = mode => ({monthly:'Resumo mensal',daily:'Resumo diário',individual:'Lançamento individual',category:'Por categoria'})[mode] || mode;

function Icon({ name }) {
  const common = {className:'icon', viewBox:'0 0 24 24', 'aria-hidden':true};
  const p = {
    home:<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V21h14V9.8"/><path d="M9 21v-7h6v7"/></>,
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    arrow:<><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    back:<path d="m15 18-6-6 6-6"/>,
    money:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/></>,
    chart:<><path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/></>,
    file:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    alert:<><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    logout:<><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    eye:<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    trash:<><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></>,
    edit:<><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    lock:<><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    brief:<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></>,
    refresh:<><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.2 6.2L4 8M5.5 15A7 7 0 0 0 17.8 17.8L20 16"/></>
  };
  return <svg {...common}>{p[name] || p.file}</svg>;
}

export default function CentralFinanceiraLive() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [state,setState] = useState(null);
  const [modal,setModal] = useState(null);
  const [toast,setToast] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [authBusy,setAuthBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id=setTimeout(()=>setToast(''),2600);
    return ()=>clearTimeout(id);
  },[toast]);

  const refresh = useCallback(async (preserve=true) => {
    if (!user) return;
    setError('');
    try {
      const data = await loadCentralData(activeOrganizationId);
      if (data.reload) {
        window.location.reload();
        return;
      }
      setState(current => {
        const old = preserve ? current : null;
        const baseRole = data.systemRole === 'super_admin' ? 'master' : 'client';
        const selected = old?.selectedCompany && data.companies.some(c=>c.id===old.selectedCompany)
          ? old.selectedCompany
          : baseRole === 'client' ? (data.companies[0]?.id || null) : null;
        return {
          view: old?.view || 'dashboard',
          selectedCompany: selected,
          tab: old?.tab || 'overview',
          month: old?.month || data.month,
          filter: old?.filter || 'all',
          search: old?.search || '',
          role: old?.role && data.systemRole === 'super_admin' ? old.role : baseRole,
          systemRole: data.systemRole,
          companies: data.companies,
          entries: data.entries,
          submissions: data.submissions,
          closings: data.closings,
          categoryRows: data.categoryRows
        };
      });
    } catch (e) {
      setError(normalizeError(e));
    }
  },[user?.id, activeOrganizationId]);

  useEffect(() => {
    if (session.isPending) return;
    if (!user) { setState(null); return; }
    refresh(false);
  },[session.isPending,user?.id,refresh]);

  const mutate = fn => setState(current => {
    if (!current) return current;
    const next={...current};
    fn(next);
    return next;
  });

  async function run(action, success, {refreshAfter=true}={}) {
    setBusy(true); setError('');
    try {
      const result=await action();
      if(refreshAfter) await refresh(true);
      if(success) setToast(success);
      return result;
    } catch(e) {
      const message=normalizeError(e);
      setError(message);
      setToast(message);
      return null;
    } finally { setBusy(false); }
  }

  async function signIn(e) {
    e.preventDefault();
    setAuthBusy(true);setError('');
    const form=new FormData(e.currentTarget);
    try {
      const result=await neonTest.auth.signIn.email({email:String(form.get('email')||'').trim(),password:String(form.get('password')||'')});
      if(result?.error) throw result.error;
      window.location.reload();
    } catch(e) { setError(normalizeError(e)); setAuthBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); window.location.reload(); }
    finally { setBusy(false); }
  }

  if(session.isPending) return <div className="empty"><strong>Validando acesso…</strong></div>;

  if(!user) return <div className="login">
    <section className="login-hero">
      <div className="brand"><div className="brandmark">LG</div>Central Financeira</div>
      <div className="login-copy"><small>ACOMPANHAMENTO FINANCEIRO</small><h1>Um acompanhamento financeiro moderno, claro e adaptável para cada cliente.</h1><p>Organize as informações financeiras de cada empresa e acompanhe cada competência com clareza.</p></div>
      <div style={{fontSize:11,color:'#9FB2E1'}}>Next.js • Neon • Visual MED 12.1</div>
    </section>
    <section className="login-side"><div className="login-card"><h2>Acessar plataforma</h2><p>Entre com seu acesso da Central Financeira.</p><form onSubmit={signIn}><div className="field"><label>E-mail</label><input name="email" className="input" type="email" required autoComplete="email"/></div><div className="field"><label>Senha</label><input name="password" className="input" type="password" required minLength={8} autoComplete="current-password"/></div><button className="btn btn-primary btn-block" disabled={authBusy}>{authBusy?'Entrando…':'Entrar'} <Icon name="arrow"/></button></form>{error&&<div className="notice" style={{color:'var(--danger)',borderColor:'#F2C9C5'}}>{error}</div>}<div className="notice"><b>Ambiente de validação:</b> autenticação e dados já usam Neon. Ainda não utilize dados reais de clientes.</div></div></section>
  </div>;

  if(!state) return <div className="empty"><strong>Carregando sua Central Financeira…</strong>{error&&<p>{error}</p>}</div>;

  const company = id => state.companies.find(c=>c.id===id);
  const entriesFor = (id,type,month=state.month) => state.entries.filter(e=>e.companyId===id&&(!type||e.type===type)&&e.month===month);
  const totals = (id,month=state.month) => {
    const rev=entriesFor(id,'revenue',month).reduce((s,e)=>s+Number(e.amount||0),0);
    const exp=entriesFor(id,'expense',month).reduce((s,e)=>s+Number(e.amount||0),0);
    return {rev,exp,balance:rev-exp,expenseRatio:rev?exp/rev*100:0};
  };
  const closingFor=(id,month=state.month)=>state.closings.find(x=>x.companyId===id&&x.month===month);
  const submissionFor=(id,month=state.month)=>state.submissions.find(x=>x.companyId===id&&x.month===month);
  const isClosed=(id,month=state.month)=>!!closingFor(id,month)?.closed;
  const isLocked=(id,month=state.month)=>isClosed(id,month)||!!submissionFor(id,month);
  const missingFor=(c,month=state.month)=>{
    const missing=[];
    if(!entriesFor(c.id,'revenue',month).length) missing.push('Receitas não informadas');
    if(c.expenseEnabled&&!entriesFor(c.id,'expense',month).length) missing.push('Despesas não informadas');
    return missing;
  };
  const statusFor=(id,month=state.month)=>{
    const closing=closingFor(id,month),submission=submissionFor(id,month);
    if(closing?.closed)return ['Fechado','closed','closed'];
    if(submission&&closing)return ['Em análise','info','analysis'];
    if(submission)return ['Pronto para análise','ok','ready'];
    if(entriesFor(id,null,month).length)return ['Preenchendo dados','info','filling'];
    return ['Aguardando dados','wait','waiting'];
  };
  const pendingText=c=>{
    if(isClosed(c.id))return 'Mês concluído';
    if(submissionFor(c.id))return closingFor(c.id)?'Análise em andamento':'Aguardando sua análise';
    const missing=missingFor(c);
    return missing.length?missing.join(' • '):'Aguardando confirmação do cliente';
  };
  const categoriesFor=(c,type)=>[...new Set([...(type==='revenue'?DEFAULT_REVENUE_CATEGORIES:DEFAULT_EXPENSE_CATEGORIES),...(type==='revenue'?(c.customRevenueCategories||[]):(c.customExpenseCategories||[]))])];
  const change=(a,b)=>b?(a-b)/b*100:null;
  const currentCompany=company(state.selectedCompany);
  const isMaster=state.systemRole==='super_admin';

  const setView=view=>mutate(s=>{s.view=view;s.selectedCompany=null;s.role=isMaster?'master':'client';});
  const openCompany=(id,tab='overview')=>mutate(s=>{s.selectedCompany=id;s.tab=tab;s.role='master';});
  const setTab=tab=>mutate(s=>{s.tab=tab;});
  const moveMonth=direction=>mutate(s=>{s.month=direction<0?previousMonth(s.month):nextMonth(s.month);});
  const previewClient=id=>{if(!isMaster)return;mutate(s=>{s.role='preview';s.selectedCompany=id;s.tab='overview';});};
  const monthControl=<div className="monthctl"><button onClick={()=>moveMonth(-1)}>‹</button><div className="monthlabel">{monthName(state.month)}</div><button onClick={()=>moveMonth(1)}>›</button></div>;

  const allRows=state.companies.map(c=>({...c,...totals(c.id),status:statusFor(c.id)}));

  function CompanyTable({rows}) {
    if(!rows.length)return <div className="empty"><div className="iconwrap"><Icon name="search"/></div><strong>Nenhum cliente encontrado</strong><p>{isMaster?'Cadastre a primeira empresa ou ajuste os filtros.':'Nenhuma empresa vinculada a este acesso.'}</p></div>;
    return <table><thead><tr><th>Cliente</th><th>Receitas</th><th>Saldo</th><th>Status</th><th>Pendência</th><th/></tr></thead><tbody>{rows.map(c=><tr key={c.id} className="clickable" onClick={()=>openCompany(c.id)}><td><div className="companycell"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>{c.document||'Sem documento'}</span></div></div></td><td>{money(c.rev)}</td><td>{c.expenseEnabled?<b className={c.balance>=0?'positive':'negative'}>{money(c.balance)}</b>:<span className="muted">Não acompanhado</span>}</td><td><span className={`status ${c.status[1]}`}>{c.status[0]}</span></td><td><span className="pendingtext">{pendingText(c)}</span></td><td><Icon name="arrow"/></td></tr>)}</tbody></table>;
  }

  function Dashboard(){
    const total=allRows.length,waiting=allRows.filter(x=>['waiting','filling'].includes(x.status[2])).length,analysis=allRows.filter(x=>['ready','analysis'].includes(x.status[2])).length,closed=allRows.filter(x=>x.status[2]==='closed').length,rev=allRows.reduce((a,b)=>a+b.rev,0);
    const kpi=(icon,label,value,foot)=><div className="card kpi"><div className="kpitop"><span className="kpilabel">{label}</span><div className="kpiicon"><Icon name={icon}/></div></div><div className="kpivalue">{value}</div><div className="kpifoot">{foot}</div></div>;
    return <><div className="pagehead"><div><h1>Visão geral</h1><p>Carteira de {monthName(state.month).toLowerCase()} e andamento da competência.</p></div><div className="actions"><button className="btn btn-secondary" onClick={()=>refresh(true)} disabled={busy}><Icon name="refresh"/>Atualizar</button>{isMaster&&<button className="btn btn-primary" onClick={()=>setModal({type:'company'})}><Icon name="plus"/>Novo cliente</button>}</div></div><div className="grid kpis">{kpi('users','Clientes ativos',total,'Empresas vinculadas')}{kpi('alert','Aguardando cliente',waiting,waiting?'Dados ou confirmação pendentes':'Carteira em dia')}{kpi('chart','Em andamento',analysis,'Prontos ou em análise')}{kpi('money','Receitas acompanhadas',money(rev),'Somatório da competência')}</div><section className="panel"><div className="panelhead"><div><h3>Carteira</h3><p>Dados carregados do Neon.</p></div></div><div className="tablewrap"><CompanyTable rows={allRows}/></div></section></>;
  }

  function Companies(){
    let rows=allRows;const q=state.search.toLowerCase().trim();if(q)rows=rows.filter(c=>(`${c.name} ${c.document} ${c.contact}`).toLowerCase().includes(q));if(state.filter!=='all')rows=rows.filter(c=>c.status[2]===state.filter||(state.filter==='progress'&&['ready','analysis'].includes(c.status[2]))||(state.filter==='waiting'&&['waiting','filling'].includes(c.status[2])));
    return <><div className="pagehead"><div><h1>Clientes</h1><p>Carteira, configuração e andamento mensal em um único lugar.</p></div>{isMaster&&<button className="btn btn-primary" onClick={()=>setModal({type:'company'})}><Icon name="plus"/>Novo cliente</button>}</div><div className="filters" style={{marginBottom:14}}><div className="search"><Icon name="search"/><input className="input" placeholder="Buscar cliente, CNPJ ou e-mail" value={state.search} onChange={e=>mutate(s=>{s.search=e.target.value;})}/></div><div className="chips">{[['all','Todos'],['waiting','Aguardando'],['progress','Em andamento'],['closed','Fechados']].map(([key,label])=><button key={key} className={`chip ${state.filter===key?'active':''}`} onClick={()=>mutate(s=>{s.filter=key;})}>{label}</button>)}</div></div><section className="panel"><div className="panelhead"><div><h3>{rows.length} empresa(s)</h3><p>Competência: {monthName(state.month)}</p></div></div><div className="tablewrap"><CompanyTable rows={rows}/></div></section></>;
  }

  function Closings(){return <><div className="pagehead"><div><h1>Fechamentos</h1><p>Envio, análise e bloqueio mensal.</p></div></div><section className="panel"><div className="tablewrap"><table><thead><tr><th>Cliente</th><th>Modelo</th><th>Receitas</th><th>Despesas</th><th>Status</th><th>Pendência</th></tr></thead><tbody>{allRows.map(c=><tr key={c.id} className="clickable" onClick={()=>openCompany(c.id,'closing')}><td><strong>{c.name}</strong></td><td>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</td><td>{money(c.rev)}</td><td>{c.expenseEnabled?money(c.exp):'—'}</td><td><span className={`status ${c.status[1]}`}>{c.status[0]}</span></td><td>{pendingText(c)}</td></tr>)}</tbody></table></div></section></>}

  function Summary({c}){const t=totals(c.id),p=totals(c.id,previousMonth(state.month)),revEntries=entriesFor(c.id,'revenue'),cr=change(t.rev,p.rev);if(!c.expenseEnabled){const avg=revEntries.length?t.rev/revEntries.length:0;return <div className="summary"><div className="summaryitem"><span>Receitas</span><strong>{money(t.rev)}</strong></div><div className="summaryitem"><span>Registros</span><strong>{revEntries.length}</strong></div><div className="summaryitem"><span>Média por registro</span><strong>{money(avg)}</strong></div><div className="summaryitem"><span>Variação mensal</span><strong>{cr===null?'Sem base':`${cr>=0?'+':''}${percent(cr)}`}</strong></div></div>}return <div className="summary"><div className="summaryitem"><span>Receitas</span><strong>{money(t.rev)}</strong></div><div className="summaryitem"><span>Despesas registradas</span><strong>{money(t.exp)}</strong></div><div className="summaryitem"><span>Saldo do período</span><strong className={t.balance>=0?'positive':'negative'}>{money(t.balance)}</strong></div><div className="summaryitem"><span>Despesas / receitas</span><strong>{t.rev?percent(t.expenseRatio):'—'}</strong></div></div>}

  function Overview({c}){const t=totals(c.id),p=totals(c.id,previousMonth(state.month)),cr=change(t.rev,p.rev),ce=change(t.exp,p.exp),signals=[];if(cr!==null)signals.push({kind:cr>=0?'good':'warn',title:`Receitas ${cr>=0?'subiram':'caíram'} ${percent(Math.abs(cr))}`,text:`Comparação com ${monthName(previousMonth(state.month)).toLowerCase()}.`});if(c.expenseEnabled&&ce!==null)signals.push({kind:ce>10?'warn':'info',title:`Despesas registradas ${ce>=0?'subiram':'caíram'} ${percent(Math.abs(ce))}`,text:'Compare a variação com o comportamento das receitas.'});if(c.expenseEnabled&&t.rev>0)signals.push({kind:t.expenseRatio<=80?'info':'warn',title:`Despesas representam ${percent(t.expenseRatio)} das receitas`,text:`Saldo financeiro do período: ${money(t.balance)}. Este indicador não representa lucro contábil.`});if(!signals.length)signals.push({kind:'info',title:'Sem comparação disponível',text:'Insira dados do mês anterior para gerar sinais automáticos.'});return <><Summary c={c}/><section className="panel" style={{marginTop:16}}><div className="panelhead"><div><h3>Sinais da competência</h3><p>Leitura baseada no nível de controle configurado.</p></div></div><div className="panelbody">{signals.map((s,i)=><div className="signal" key={i}><div className={`signalicon ${s.kind}`}><Icon name={s.kind==='good'?'check':s.kind==='warn'?'alert':'chart'}/></div><div><strong>{s.title}</strong><p>{s.text}</p></div></div>)}</div></section></>}

  function Entries({c,type}){const revenue=type==='revenue',mode=revenue?c.revenueMode:c.expenseMode,list=[...entriesFor(c.id,type)].sort((a,b)=>(b.date||'').localeCompare(a.date||'')),total=list.reduce((s,e)=>s+Number(e.amount||0),0),locked=isLocked(c.id),closed=isClosed(c.id),buttonText=mode==='monthly'?(revenue?'Informar mês':'Informar total'):mode==='daily'?'Informar dia':mode==='category'?'Informar categoria':revenue?'Nova receita':'Nova despesa';return <>{locked&&<div className="lockbar"><div><Icon name="lock"/></div><div style={{flex:1}}><strong>{closed?'Competência fechada':'Envio concluído'}</strong><p>{closed?'Os lançamentos estão bloqueados.':'Os dados foram confirmados e estão bloqueados.'}</p></div></div>}<div className="pagehead"><div><h1 style={{fontSize:21}}>{revenue?'Receitas':'Despesas'}</h1><p>{modeName(mode)} • {monthName(state.month)}</p></div>{!locked&&<button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:type})}><Icon name="plus"/>{buttonText}</button>}</div><section className="panel"><div className="panelhead"><div><h3>Total: {money(total)}</h3><p>{list.length} registro(s) nesta competência</p></div><span className="badge">{modeName(mode)}</span></div>{list.length?<div className="tablewrap"><table><thead><tr><th>{mode==='category'?'Categoria':'Data'}</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th/></tr></thead><tbody>{list.map(e=><tr key={e.id}><td>{mode==='category'?e.category:formatDate(e.date)}</td><td>{e.description}</td><td>{e.category}</td><td><b>{money(e.amount)}</b></td><td>{!locked&&<button className="iconbtn dangertext" disabled={busy} onClick={()=>removeEntry(e.id)}><Icon name="trash"/></button>}</td></tr>)}</tbody></table></div>:<div className="empty"><div className="iconwrap"><Icon name={revenue?'money':'file'}/></div><strong>Nenhum dado informado</strong><p>Adicione o primeiro registro desta competência.</p></div>}</section></>}

  function Closing({c}){const closing=closingFor(c.id)||{},submitted=!!submissionFor(c.id),closed=isClosed(c.id);return <><Summary c={c}/>{!submitted&&!closed&&<div className="lockbar"><div><Icon name="alert"/></div><div style={{flex:1}}><strong>Aguardando conclusão do envio</strong><p>{missingFor(c).length?missingFor(c).join(' • '):'Os dados estão preenchidos, mas ainda precisam ser confirmados.'}</p></div>{isMaster&&<button className="btn btn-secondary" onClick={()=>previewClient(c.id)}>Ver como cliente</button>}</div>}<section className="panel" style={{marginTop:16}}><div className="panelhead"><div><h3>Análise do mês</h3><p>Leitura e orientação liberadas após o fechamento.</p></div></div><form className="panelbody" onSubmit={e=>submitClosing(e,c.id)}><div className="field"><label>O que aconteceu neste mês?</label><textarea name="analysis" className="textarea" defaultValue={closing.analysis||''}/></div><div className="field"><label>Pontos de atenção</label><textarea name="attention" className="textarea" defaultValue={closing.attention||''}/></div><div className="field"><label>Recomendações</label><textarea name="recommendation" className="textarea" defaultValue={closing.recommendation||''}/></div>{isMaster&&<div className="actions" style={{justifyContent:'flex-end'}}>{closed?<button type="button" className="btn btn-secondary" onClick={()=>reopenClosing(c.id)}>Reabrir competência</button>:<button className="btn btn-secondary" name="intent" value="draft" disabled={busy}>Salvar rascunho</button>}<button className="btn btn-primary" name="intent" value="close" disabled={busy}><Icon name="lock"/>{closed?'Atualizar análise':'Fechar mês'}</button></div>}</form></section></>}

  function Config({c}){if(!isMaster)return null;const categorySection=type=>{const revenue=type==='revenue',base=revenue?DEFAULT_REVENUE_CATEGORIES:DEFAULT_EXPENSE_CATEGORIES,custom=revenue?(c.customRevenueCategories||[]):(c.customExpenseCategories||[]);return <div className="categorybox"><h4>Categorias de {revenue?'receitas':'despesas'}</h4><p>Categorias padrão + específicas da empresa.</p><div className="categorylist">{base.map(x=><span className="categorytag" key={x}>{x}</span>)}{custom.map(x=><span className="categorytag custom" key={x}>{x}<button onClick={()=>removeCategory(c.id,type,x)}>×</button></span>)}</div><form className="inlineadd" onSubmit={e=>addCategory(e,c.id,type)}><input name="category" className="input" placeholder="Nova categoria"/><button className="btn btn-secondary" disabled={busy}>Adicionar</button></form></div>};return <div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Configuração do acompanhamento</h3><p>Alterações são gravadas no Neon.</p></div></div><div className="panelbody"><div className="setting"><div><h4>Receitas / vendas</h4><p>Nível de detalhe do cliente.</p></div><div className="settingactions"><select className="select mode" value={c.revenueMode} onChange={e=>changeSetting(c.id,'revenueMode',e.target.value)} disabled={busy}><option value="monthly">Resumo mensal</option><option value="daily">Resumo diário</option><option value="individual">Venda por venda</option></select></div></div><div className="setting"><div><h4>Despesas</h4><p>Ative quando fizer parte do acompanhamento.</p></div><div className="settingactions"><select className="select mode" value={c.expenseMode} disabled={!c.expenseEnabled||busy} onChange={e=>changeSetting(c.id,'expenseMode',e.target.value)}><option value="monthly">Total mensal</option><option value="category">Por categoria</option><option value="individual">Lançamento individual</option></select><button className={`switch ${c.expenseEnabled?'on':''}`} onClick={()=>changeSetting(c.id,'expenseEnabled',!c.expenseEnabled)} disabled={busy}/></div></div>{categorySection('revenue')}{c.expenseEnabled&&categorySection('expense')}</div></section><section className="panel span5"><div className="panelhead"><div><h3>Dados da empresa</h3><p>Informações vinculadas à organização.</p></div></div><form className="panelbody" onSubmit={e=>saveCompanyMetadata(e,c)}><div className="field"><label>CNPJ / CPF</label><input name="document" className="input" defaultValue={c.document==='Não informado'?'':c.document}/></div><div className="field"><label>E-mail principal</label><input name="contact" type="email" className="input" defaultValue={c.contact||''}/></div><button className="btn btn-primary btn-block" disabled={busy}>Salvar dados</button>{isMaster&&<button type="button" className="btn btn-secondary btn-block" style={{marginTop:8}} onClick={()=>previewClient(c.id)}><Icon name="eye"/>Visualizar área do cliente</button>}</form></section></div>}

  function Workspace({c}){const status=statusFor(c.id),tabs=[['overview','Visão geral'],['revenue','Receitas']];if(c.expenseEnabled)tabs.push(['expense','Despesas']);tabs.push(['closing','Fechamento']);if(isMaster)tabs.push(['config','Configuração']);let body=<Overview c={c}/>;if(state.tab==='revenue')body=<Entries c={c} type="revenue"/>;if(state.tab==='expense')body=<Entries c={c} type="expense"/>;if(state.tab==='closing')body=<Closing c={c}/>;if(state.tab==='config')body=<Config c={c}/>;return <><button className="btn btn-ghost" style={{paddingLeft:0,marginBottom:8}} onClick={()=>mutate(s=>{s.selectedCompany=null;})}><Icon name="back"/>Voltar</button><div className="companyhero"><div className="companytitle"><div className="avatar">{initials(c.name)}</div><div><h2>{c.name}</h2><p>{c.document} • {c.contact||'Sem e-mail principal'}</p></div></div><div className="herometa"><div><span>Modelo</span><strong>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</strong></div><div><span>Status</span><strong>{status[0]}</strong></div>{isMaster&&<button className="btn btn-secondary" onClick={()=>previewClient(c.id)}><Icon name="eye"/>Ver como cliente</button>}</div></div><div className="tabs">{tabs.map(([key,label])=><button className={`tab ${state.tab===key?'active':''}`} key={key} onClick={()=>setTab(key)}>{label}</button>)}</div>{body}</>}

  function ClientShell({c}){const realClient=!isMaster,tabs=[['overview','home','Início'],['revenue','money','Receitas']];if(c.expenseEnabled)tabs.push(['expense','file','Despesas']);tabs.push(['closing','chart','Acompanhamento']);let body=<ClientHome c={c}/>;if(state.tab==='revenue')body=<Entries c={c} type="revenue"/>;if(state.tab==='expense')body=<Entries c={c} type="expense"/>;if(state.tab==='closing')body=<ClientFollowup c={c}/>;return <div className="shell client-shell"><aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Meu Financeiro</div><div className="navtitle">{c.name}</div>{tabs.map(([key,icon,label])=><button key={key} className={`navbtn ${state.tab===key?'active':''}`} onClick={()=>setTab(key)}><Icon name={icon}/>{label}</button>)}<div className="sidebottom"><div className="usercard"><div className="avatar">{initials(user.name||c.name)}</div><div><strong>{user.name||c.name}</strong><span>Área do cliente</span></div></div>{!realClient&&<button className="navbtn" onClick={()=>mutate(s=>{s.role='master';})}><Icon name="back"/>Voltar ao Master</button>}<button className="navbtn" onClick={signOut}><Icon name="logout"/>Sair</button></div></aside><main className="main"><header className="topbar"><div className="crumb"><strong>{c.name}</strong></div><div className="topright">{monthControl}<div className="avatar">{initials(user.name||c.name)}</div></div></header><div className="content">{!realClient&&<div className="client-banner"><span><b>Prévia do cliente:</b> visualização do ambiente desta empresa.</span><button className="btn btn-secondary" onClick={()=>mutate(s=>{s.role='master';})}>Sair da prévia</button></div>}{body}</div></main></div>}

  function ClientHome({c}){const submission=submissionFor(c.id),missing=missingFor(c),closed=isClosed(c.id),locked=isLocked(c.id);return <><div className="pagehead"><div><h1>Olá, {String(user.name||c.name).split(' ')[0]}</h1><p>Visão de {monthName(state.month).toLowerCase()}.</p></div>{!locked&&<div className="actions"><button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:'revenue'})}><Icon name="plus"/>Informar receita</button>{c.expenseEnabled&&<button className="btn btn-secondary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:'expense'})}>Informar despesa</button>}</div>}</div><Summary c={c}/><section className="panel" style={{marginTop:16}}><div className="panelhead"><div><h3>Envio da competência</h3><p>Conclua depois de conferir as informações.</p></div></div><div className="panelbody">{closed?<div className="signal"><div className="signalicon good"><Icon name="lock"/></div><div><strong>Competência concluída</strong><p>Este mês já foi fechado pelo contador.</p></div></div>:submission?<div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Dados enviados</strong><p>Os lançamentos estão bloqueados até eventual reabertura.</p></div></div>:<><div className="signal"><div className={`signalicon ${missing.length?'warn':'info'}`}><Icon name={missing.length?'alert':'check'}/></div><div><strong>{missing.length?'Ainda falta informação':'Pronto para concluir'}</strong><p>{missing.length?missing.join(' • '):'Os módulos ativos possuem dados registrados.'}</p></div></div><button className="btn btn-primary btn-block" disabled={!!missing.length||busy} onClick={()=>confirmSubmission(c.id)}><Icon name="check"/>Confirmar dados de {monthName(state.month)}</button></>}</div></section></>}

  function ClientFollowup({c}){const closing=closingFor(c.id);return <><div className="pagehead"><div><h1>Acompanhamento</h1><p>Orientações liberadas pelo seu contador.</p></div></div><section className="panel"><div className="panelbody">{closing?.closed?<><div className="field"><label>Leitura do mês</label><div className="notice">{closing.analysis||'Sem análise registrada.'}</div></div><div className="field"><label>Pontos de atenção</label><div className="notice">{closing.attention||'Sem pontos registrados.'}</div></div><div className="field"><label>Recomendação</label><div className="notice">{closing.recommendation||'Sem recomendação registrada.'}</div></div></>:<div className="empty"><div className="iconwrap"><Icon name="file"/></div><strong>Fechamento em andamento</strong><p>Quando a análise for concluída, ela aparecerá aqui.</p></div>}</div></section></>}

  async function submitCompany(e){e.preventDefault();const f=new FormData(e.currentTarget);const id=await run(()=>createNeonCompany({name:String(f.get('name')||'').trim(),document:String(f.get('document')||'').trim(),contact:String(f.get('contact')||'').trim(),revenueMode:String(f.get('revenueMode')||'monthly'),expenseEnabled:f.get('expenseEnabled')==='true'}),'Cliente criado');if(id){setModal(null);setState(s=>s?{...s,selectedCompany:id,tab:'config',role:'master'}:s)}}

  async function submitEntry(e){e.preventDefault();const {companyId,entryType}=modal,c=company(companyId),revenue=entryType==='revenue',mode=revenue?c.revenueMode:c.expenseMode,f=new FormData(e.currentTarget),amount=Number(f.get('amount')),date=String(f.get('date')||`${state.month}-01`),category=String(f.get('category')||''),description=String(f.get('description')||(mode==='category'?category:`Total de ${monthName(state.month).toLowerCase()}`));let existing=null;if(mode==='monthly')existing=state.entries.find(x=>x.companyId===companyId&&x.type===entryType&&x.month===state.month&&x.mode==='monthly');if(mode==='daily')existing=state.entries.find(x=>x.companyId===companyId&&x.type===entryType&&x.date===date&&x.mode==='daily');if(mode==='category')existing=state.entries.find(x=>x.companyId===companyId&&x.type===entryType&&x.month===state.month&&x.category===category&&x.mode==='category');let categoryId=null;if(category)categoryId=await run(()=>ensureCategory(state.categoryRows,companyId,entryType,category),null,{refreshAfter:false});if(category&& !categoryId)return;const saved=await run(()=>saveFinancialEntry({existingId:existing?.id,organizationId:companyId,competency:state.month,occurredOn:date,type:entryType,description,categoryId,amount,mode}),'Informação salva');if(saved!==null)setModal(null)}

  async function removeEntry(id){if(!confirm('Excluir este lançamento?'))return;await run(()=>deleteFinancialEntry(id),'Lançamento excluído')}
  async function changeSetting(id,key,value){await run(()=>updateOrganizationSettings(id,{[key]:value}),'Configuração atualizada')}
  async function saveCompanyMetadata(e,c){e.preventDefault();const f=new FormData(e.currentTarget);await run(()=>updateCompanyMetadata(c,{document:String(f.get('document')||'').trim(),contact:String(f.get('contact')||'').trim()}),'Dados atualizados')}
  async function addCategory(e,id,type){e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('category')||'').trim();if(!name)return;const c=company(id);if(categoriesFor(c,type).some(x=>x.toLowerCase()===name.toLowerCase()))return setToast('Essa categoria já existe');await run(()=>addNeonCategory(id,type,name,false),'Categoria adicionada');e.currentTarget.reset()}
  async function removeCategory(id,type,name){await run(()=>deactivateCategory(id,type,name),'Categoria removida')}
  async function confirmSubmission(id){const c=company(id);if(missingFor(c).length)return;if(!confirm(`Confirmar os dados de ${monthName(state.month)}?`))return;await run(()=>confirmMonth({organizationId:id,month:state.month,settingsSnapshot:{revenueMode:c.revenueMode,expenseEnabled:c.expenseEnabled,expenseMode:c.expenseMode}}),'Dados confirmados e enviados')}
  async function submitClosing(e,id){e.preventDefault();if(!submissionFor(id)&&!isClosed(id))return setToast('O cliente ainda não confirmou os dados');const f=new FormData(e.currentTarget),intent=e.nativeEvent.submitter?.value||'draft';await run(()=>saveMonthlyClosing({organizationId:id,month:state.month,analysis:String(f.get('analysis')||''),attention:String(f.get('attention')||''),recommendation:String(f.get('recommendation')||''),close:intent==='close'}),intent==='close'?'Mês fechado e bloqueado':'Rascunho salvo')}
  async function reopenSubmission(id){if(isClosed(id))return;if(!confirm('Reabrir o envio?'))return;await run(()=>reopenMonthSubmission(id,state.month),'Envio reaberto')}
  async function reopenClosing(id){if(!confirm('Reabrir esta competência?'))return;await run(()=>reopenMonthlyClosing(id,state.month),'Competência reaberta')}

  function Modal(){if(!modal)return null;if(modal.type==='company')return <div className="modalback"><div className="modal"><div className="modalhead"><h3>Novo cliente</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><form onSubmit={submitCompany}><div className="modalbody"><div className="formgrid"><div className="field full"><label>Nome da empresa</label><input name="name" className="input" required/></div><div className="field"><label>CNPJ / CPF</label><input name="document" className="input"/></div><div className="field"><label>E-mail principal</label><input name="contact" type="email" className="input"/></div><div className="field"><label>Receitas</label><select name="revenueMode" className="select"><option value="monthly">Resumo mensal</option><option value="daily">Resumo diário</option><option value="individual">Venda por venda</option></select></div><div className="field"><label>Despesas</label><select name="expenseEnabled" className="select"><option value="false">Não acompanhar</option><option value="true">Acompanhar</option></select></div></div><div className="notice">A empresa será criada como uma organização isolada no Neon.</div></div><div className="modalfoot"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy}>Criar cliente</button></div></form></div></div>;const c=company(modal.companyId),revenue=modal.entryType==='revenue',mode=revenue?c.revenueMode:c.expenseMode,monthly=mode==='monthly',daily=mode==='daily',categoryMode=mode==='category',cats=categoriesFor(c,modal.entryType),defaultDate=`${state.month}-${String(Math.min(new Date().getDate(),28)).padStart(2,'0')}`;return <div className="modalback"><div className="modal"><div className="modalhead"><h3>{revenue?'Informar receita':'Informar despesa'}</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><form onSubmit={submitEntry}><div className="modalbody"><div className="formgrid">{!monthly&&!categoryMode&&<div className="field"><label>Data</label><input name="date" type="date" className="input" defaultValue={defaultDate} required/></div>}<div className={`field ${monthly||categoryMode?'full':''}`}><label>Valor</label><input name="amount" type="number" min="0" step="0.01" className="input" required/></div>{categoryMode?<div className="field full"><label>Categoria</label><select name="category" className="select">{cats.map(x=><option key={x}>{x}</option>)}</select></div>:mode==='individual'?<><div className="field full"><label>Descrição</label><input name="description" className="input" required/></div><div className="field full"><label>Categoria</label><select name="category" className="select">{cats.map(x=><option key={x}>{x}</option>)}</select></div></>:daily?<div className="field full"><label>Descrição</label><input name="description" className="input" defaultValue="Total do dia"/></div>:null}</div></div><div className="modalfoot"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy}>Salvar</button></div></form></div></div>}

  if(state.role!=='master'&&currentCompany)return <><ClientShell c={currentCompany}/><Modal/>{toast&&<div className="toast">{toast}</div>}</>;

  const navButton=(view,icon,label)=><button className={`navbtn ${state.view===view&&!state.selectedCompany?'active':''}`} onClick={()=>setView(view)}><Icon name={icon}/>{label}</button>;
  const sidebar=<aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Central Financeira</div><div className="navtitle">Gestão</div>{navButton('dashboard','home','Visão geral')}{navButton('companies','users','Clientes')}{navButton('closings','check','Fechamentos')}<div className="navtitle">Sistema</div>{navButton('settings','settings','Configurações')}<div className="sidebottom"><div className="usercard"><div className="avatar">{initials(user.name||'LG')}</div><div><strong>{user.name||user.email}</strong><span>Super Admin</span></div></div><button className="navbtn" onClick={signOut} disabled={busy}><Icon name="logout"/>Sair</button></div></aside>;

  function Settings(){return <><div className="pagehead"><div><h1>Configurações</h1><p>Estado técnico da Central Financeira.</p></div><button className="btn btn-secondary" onClick={()=>refresh(true)}><Icon name="refresh"/>Sincronizar</button></div><div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Conta</h3><p>Autenticação real via Neon Auth.</p></div></div><div className="panelbody"><div className="formgrid"><div className="field full"><label>Nome</label><input className="input" value={user.name||''} readOnly/></div><div className="field"><label>E-mail</label><input className="input" value={user.email||''} readOnly/></div><div className="field"><label>Perfil</label><input className="input" value={state.systemRole==='super_admin'?'Super Admin':'Cliente'} readOnly/></div></div></div></section><section className="panel span5"><div className="panelhead"><div><h3>Persistência</h3><p>Dados desta versão.</p></div></div><div className="panelbody"><div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Neon conectado</strong><p>Login, organizações e informações financeiras são gravados no banco com RLS.</p></div></div><div className="notice"><b>Validação:</b> esta versão ainda aponta para a branch isolada de teste. Não coloque dados reais de clientes até promovermos a estrutura para produção.</div></div></section></div></>}

  let content=<Dashboard/>;if(state.view==='companies')content=<Companies/>;if(state.view==='closings')content=<Closings/>;if(state.view==='settings')content=<Settings/>;if(currentCompany)content=<Workspace c={currentCompany}/>;
  const titleView=({dashboard:'Visão geral',companies:'Clientes',closings:'Fechamentos',settings:'Configurações'})[state.view]||'Visão geral';
  return <><div className="shell">{sidebar}<main className="main"><header className="topbar"><div className="crumb">Central Financeira <span>›</span><strong>{currentCompany?currentCompany.name:titleView}</strong></div><div className="topright">{monthControl}<div className="avatar">{initials(user.name||'LG')}</div></div></header><div className="content">{error&&<div className="notice" style={{marginBottom:14,color:'var(--danger)',borderColor:'#F2C9C5'}}>{error}</div>}{content}</div></main></div><Modal/>{toast&&<div className="toast">{toast}</div>}</>;
}
