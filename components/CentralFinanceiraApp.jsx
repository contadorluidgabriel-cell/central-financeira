'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createDemoState,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_REVENUE_CATEGORIES,
  nextMonth,
  previousMonth
} from '../lib/demo-data';

const copy = value => JSON.parse(JSON.stringify(value));
const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const monthName = key => {
  const [y,m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).replace(/^./, c => c.toUpperCase());
};
const formatDate = date => date ? date.split('-').reverse().join('/') : '—';
const initials = name => name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
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
    brief:<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></>
  };
  return <svg {...common}>{p[name] || p.file}</svg>;
}

export default function CentralFinanceiraApp() {
  const [state,setState] = useState(null);
  const [modal,setModal] = useState(null);
  const [toast,setToast] = useState('');

  useEffect(() => {
    const fallback = createDemoState();
    try {
      const raw = localStorage.getItem('central-financeira-next-v2') || localStorage.getItem('central-financeira-v1-2');
      setState(raw ? {...fallback,...JSON.parse(raw)} : fallback);
    } catch {
      setState(fallback);
    }
  },[]);

  useEffect(() => {
    if (!state) return;
    try { localStorage.setItem('central-financeira-next-v2',JSON.stringify(state)); } catch {}
  },[state]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(()=>setToast(''),2200);
    return ()=>clearTimeout(id);
  },[toast]);

  const mutate = fn => setState(current => { const next = copy(current); fn(next); return next; });
  const company = id => state.companies.find(c=>c.id===id);
  const entriesFor = (id,type,month=state.month) => state.entries.filter(e=>e.companyId===id && (!type || e.type===type) && (e.month || e.date?.slice(0,7))===month);
  const totals = (id,month=state.month) => {
    const rev = entriesFor(id,'revenue',month).reduce((s,e)=>s+Number(e.amount||0),0);
    const exp = entriesFor(id,'expense',month).reduce((s,e)=>s+Number(e.amount||0),0);
    return {rev,exp,balance:rev-exp,expenseRatio:rev ? exp/rev*100 : 0};
  };
  const closingFor = (id,month=state.month) => state.closings.find(x=>x.companyId===id&&x.month===month);
  const submissionFor = (id,month=state.month) => state.submissions.find(x=>x.companyId===id&&x.month===month);
  const isClosed = (id,month=state.month) => !!closingFor(id,month)?.closed;
  const isLocked = (id,month=state.month) => isClosed(id,month) || !!submissionFor(id,month);
  const missingFor = (c,month=state.month) => {
    const missing=[];
    if (!entriesFor(c.id,'revenue',month).length) missing.push('Receitas não informadas');
    if (c.expenseEnabled && !entriesFor(c.id,'expense',month).length) missing.push('Despesas não informadas');
    return missing;
  };
  const statusFor = (id,month=state.month) => {
    const closing=closingFor(id,month), submission=submissionFor(id,month);
    if (closing?.closed) return ['Fechado','closed','closed'];
    if (submission&&closing) return ['Em análise','info','analysis'];
    if (submission) return ['Pronto para análise','ok','ready'];
    if (entriesFor(id,null,month).length) return ['Preenchendo dados','info','filling'];
    return ['Aguardando dados','wait','waiting'];
  };
  const pendingText = c => {
    if (isClosed(c.id)) return 'Mês concluído';
    if (submissionFor(c.id)) return closingFor(c.id) ? 'Análise em andamento' : 'Aguardando sua análise';
    const missing=missingFor(c);
    return missing.length ? missing.join(' • ') : 'Aguardando confirmação do cliente';
  };
  const categoriesFor = (c,type) => [...new Set([
    ...(type==='revenue'?DEFAULT_REVENUE_CATEGORIES:DEFAULT_EXPENSE_CATEGORIES),
    ...(type==='revenue'?(c.customRevenueCategories||[]):(c.customExpenseCategories||[]))
  ])];
  const change = (a,b) => b ? (a-b)/b*100 : null;
  const currentCompany = state ? company(state.selectedCompany) : null;

  if (!state) return <div className="empty"><strong>Carregando Central Financeira…</strong></div>;

  const setView = view => mutate(s=>{s.view=view;s.selectedCompany=null;s.role='master';});
  const openCompany = (id,tab='overview') => mutate(s=>{s.selectedCompany=id;s.tab=tab;s.role='master';});
  const setTab = tab => mutate(s=>{s.tab=tab;});
  const moveMonth = direction => mutate(s=>{s.month=direction<0?previousMonth(s.month):nextMonth(s.month);});
  const previewClient = id => mutate(s=>{s.role='client';s.selectedCompany=id;s.tab='overview';});

  const loginView = <div className="login">
    <section className="login-hero">
      <div className="brand"><div className="brandmark">LG</div>Central Financeira</div>
      <div className="login-copy"><small>ACOMPANHAMENTO FINANCEIRO</small><h1>Um acompanhamento financeiro moderno, claro e adaptável para cada cliente.</h1><p>Configure o nível de controle de cada empresa, acompanhe os dados do mês e mantenha cada cliente com apenas o que precisa controlar.</p></div>
      <div style={{fontSize:11,color:'#9FB2E1'}}>V2 • Next.js + Visual MED 12.1</div>
    </section>
    <section className="login-side"><div className="login-card"><h2>Acessar plataforma</h2><p>Protótipo React preparado para a próxima integração com Supabase.</p><form onSubmit={e=>{e.preventDefault();mutate(s=>{s.loggedIn=true;});}}><div className="field"><label>E-mail</label><input className="input" type="email" defaultValue="contador@luidgabriel.com.br" required/></div><div className="field"><label>Senha</label><input className="input" type="password" defaultValue="12345678" required/></div><button className="btn btn-primary btn-block">Entrar como Master <Icon name="arrow"/></button></form><div className="notice"><b>Demonstração:</b> ainda usa armazenamento local. Não utilize dados reais.</div></div></section>
  </div>;

  if (!state.loggedIn) return loginView;

  const monthControl = <div className="monthctl"><button onClick={()=>moveMonth(-1)}>‹</button><div className="monthlabel">{monthName(state.month)}</div><button onClick={()=>moveMonth(1)}>›</button></div>;

  const navButton = (view,icon,label) => <button className={`navbtn ${state.view===view&&!state.selectedCompany?'active':''}`} onClick={()=>setView(view)}><Icon name={icon}/>{label}</button>;

  const masterSidebar = <aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Central Financeira</div><div className="navtitle">Gestão</div>{navButton('dashboard','home','Visão geral')}{navButton('companies','users','Clientes')}{navButton('closings','check','Fechamentos')}<div className="navtitle">Sistema</div>{navButton('settings','settings','Configurações')}<div className="sidebottom"><div className="usercard"><div className="avatar">LG</div><div><strong>Luid Gabriel</strong><span>Super Admin</span></div></div><button className="navbtn" onClick={()=>mutate(s=>{s.loggedIn=false;s.role='master';s.selectedCompany=null;})}><Icon name="logout"/>Sair</button></div></aside>;

  const titleView = ({dashboard:'Visão geral',companies:'Clientes',closings:'Fechamentos',settings:'Configurações'})[state.view] || 'Visão geral';
  const kpi = (icon,label,value,foot) => <div className="card kpi"><div className="kpitop"><span className="kpilabel">{label}</span><div className="kpiicon"><Icon name={icon}/></div></div><div className="kpivalue">{value}</div><div className="kpifoot">{foot}</div></div>;
  const progress = (label,n,total) => <div className="progressrow"><span>{label}</span><b>{n}</b><div className="track"><div className="bar" style={{width:`${total?Math.round(n/total*100):0}%`}}/></div></div>;

  const allRows = state.companies.map(c=>({...c,...totals(c.id),status:statusFor(c.id)}));

  function CompanyTable({ rows }) {
    if (!rows.length) return <div className="empty"><div className="iconwrap"><Icon name="search"/></div><strong>Nenhum cliente encontrado</strong><p>Ajuste a busca ou os filtros.</p></div>;
    return <table><thead><tr><th>Cliente</th><th>Receitas</th><th>Saldo</th><th>Status</th><th>Pendência</th><th/></tr></thead><tbody>{rows.map(c=><tr key={c.id} className="clickable" onClick={()=>openCompany(c.id)}><td><div className="companycell"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>{c.document||'Sem documento'}</span></div></div></td><td>{money(c.rev)}</td><td>{c.expenseEnabled?<b className={c.balance>=0?'positive':'negative'}>{money(c.balance)}</b>:<span className="muted">Não acompanhado</span>}</td><td><span className={`status ${c.status[1]}`}>{c.status[0]}</span></td><td><span className={`pendingtext ${['waiting','filling'].includes(c.status[2])?'warntext':''}`}>{pendingText(c)}</span></td><td><Icon name="arrow"/></td></tr>)}</tbody></table>;
  }

  function Dashboard() {
    const total=allRows.length;
    const waiting=allRows.filter(x=>['waiting','filling'].includes(x.status[2])).length;
    const analysis=allRows.filter(x=>['ready','analysis'].includes(x.status[2])).length;
    const closed=allRows.filter(x=>x.status[2]==='closed').length;
    const rev=allRows.reduce((a,b)=>a+b.rev,0);
    return <><div className="pagehead"><div><h1>Visão geral</h1><p>Carteira de {monthName(state.month).toLowerCase()} e o andamento da competência.</p></div><div className="actions"><button className="btn btn-secondary" onClick={()=>setView('companies')}>Ver clientes</button><button className="btn btn-primary" onClick={()=>setModal({type:'company'})}><Icon name="plus"/>Novo cliente</button></div></div><div className="grid kpis">{kpi('users','Clientes ativos',total,'Empresas cadastradas')}{kpi('alert','Aguardando cliente',waiting,waiting?'Dados ou confirmação pendentes':'Carteira em dia')}{kpi('chart','Em andamento',analysis,'Prontos ou em análise')}{kpi('money','Receitas acompanhadas',money(rev),'Somatório da competência')}</div><div className="grid dashboardgrid"><section className="panel"><div className="panelhead"><div><h3>Carteira</h3><p>Abra um cliente para trabalhar na competência.</p></div><button className="btn btn-secondary" onClick={()=>setView('companies')}>Ver todos</button></div><div className="tablewrap"><CompanyTable rows={allRows.slice(0,6)}/></div></section><section className="panel"><div className="panelhead"><div><h3>Fluxo do mês</h3><p>{closed} de {total} clientes fechados</p></div></div><div className="panelbody"><div className="progresslist">{progress('Aguardando cliente',waiting,total)}{progress('Em andamento',analysis,total)}{progress('Fechados',closed,total)}</div><div className="divider"/><div className="signal"><div className={`signalicon ${waiting?'warn':'good'}`}><Icon name={waiting?'alert':'check'}/></div><div><strong>{waiting?`${waiting} cliente(s) com envio pendente`:'Todos concluíram o envio'}</strong><p>{waiting?'Abra a carteira para ver exatamente o que falta em cada empresa.':'A carteira já pode avançar para análise e fechamento.'}</p></div></div></div></section></div></>;
  }

  function Companies() {
    let rows=allRows;
    const q=state.search.toLowerCase().trim();
    if(q) rows=rows.filter(c=>(c.name+' '+c.document+' '+c.contact).toLowerCase().includes(q));
    if(state.filter!=='all') rows=rows.filter(c=>c.status[2]===state.filter||(state.filter==='progress'&&['ready','analysis'].includes(c.status[2]))||(state.filter==='waiting'&&['waiting','filling'].includes(c.status[2])));
    return <><div className="pagehead"><div><h1>Clientes</h1><p>Carteira, configuração e andamento mensal em um único lugar.</p></div><button className="btn btn-primary" onClick={()=>setModal({type:'company'})}><Icon name="plus"/>Novo cliente</button></div><div className="filters" style={{marginBottom:14}}><div className="search"><Icon name="search"/><input className="input" placeholder="Buscar cliente, CNPJ ou e-mail" value={state.search} onChange={e=>mutate(s=>{s.search=e.target.value;})}/></div><div className="chips">{[['all','Todos'],['waiting','Aguardando'],['progress','Em andamento'],['closed','Fechados']].map(([key,label])=><button key={key} className={`chip ${state.filter===key?'active':''}`} onClick={()=>mutate(s=>{s.filter=key;})}>{label}</button>)}</div></div><section className="panel"><div className="panelhead"><div><h3>{rows.length} empresa(s)</h3><p>Competência: {monthName(state.month)}</p></div></div><div className="tablewrap"><CompanyTable rows={rows}/></div></section></>;
  }

  function Closings() {
    return <><div className="pagehead"><div><h1>Fechamentos</h1><p>O cliente conclui o envio antes da análise, e o mês fechado fica bloqueado.</p></div></div><section className="panel"><div className="tablewrap"><table><thead><tr><th>Cliente</th><th>Modelo</th><th>Receitas</th><th>Despesas</th><th>Status</th><th>Pendência</th><th/></tr></thead><tbody>{allRows.map(c=><tr key={c.id} className="clickable" onClick={()=>openCompany(c.id,'closing')}><td><div className="companycell"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>{c.contact}</span></div></div></td><td>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</td><td>{money(c.rev)}</td><td>{c.expenseEnabled?money(c.exp):'—'}</td><td><span className={`status ${c.status[1]}`}>{c.status[0]}</span></td><td><span className="pendingtext">{pendingText(c)}</span></td><td><Icon name="arrow"/></td></tr>)}</tbody></table></div></section></>;
  }

  function Settings() {
    return <><div className="pagehead"><div><h1>Configurações</h1><p>Parâmetros gerais do protótipo.</p></div></div><div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Escritório</h3><p>Identidade do usuário Master.</p></div></div><div className="panelbody"><div className="formgrid"><div className="field full"><label>Nome</label><input className="input" defaultValue="Contador Luid Gabriel"/></div><div className="field"><label>Usuário Master</label><input className="input" defaultValue="Luid Gabriel"/></div><div className="field"><label>Perfil</label><input className="input" value="Super Admin" disabled readOnly/></div></div><button className="btn btn-primary" onClick={()=>setToast('Configurações salvas na demonstração')}>Salvar</button></div></section><section className="panel span5"><div className="panelhead"><div><h3>Persistência</h3><p>Estado desta versão.</p></div></div><div className="panelbody"><div className="signal"><div className="signalicon info"><Icon name="lock"/></div><div><strong>Pronto para Supabase</strong><p>A interface já está em React; a persistência ainda é local.</p></div></div><button className="btn btn-danger btn-block" onClick={()=>{if(confirm('Restaurar todos os dados da demonstração?')) setState({...createDemoState(),loggedIn:true});}}>Restaurar demonstração</button></div></section></div></>;
  }

  function Summary({ c }) {
    const t=totals(c.id), p=totals(c.id,previousMonth(state.month)), revEntries=entriesFor(c.id,'revenue'), cr=change(t.rev,p.rev);
    if(!c.expenseEnabled){const avg=revEntries.length?t.rev/revEntries.length:0;return <div className="summary"><div className="summaryitem"><span>Receitas</span><strong>{money(t.rev)}</strong></div><div className="summaryitem"><span>Registros</span><strong>{revEntries.length}</strong></div><div className="summaryitem"><span>Média por registro</span><strong>{money(avg)}</strong></div><div className="summaryitem"><span>Variação mensal</span><strong className={cr===null?'':cr>=0?'positive':'negative'}>{cr===null?'Sem base':`${cr>=0?'+':''}${percent(cr)}`}</strong></div></div>}
    return <div className="summary"><div className="summaryitem"><span>Receitas</span><strong>{money(t.rev)}</strong></div><div className="summaryitem"><span>Despesas registradas</span><strong>{money(t.exp)}</strong></div><div className="summaryitem"><span>Saldo do período</span><strong className={t.balance>=0?'positive':'negative'}>{money(t.balance)}</strong></div><div className="summaryitem"><span>Despesas / receitas</span><strong>{t.rev?percent(t.expenseRatio):'—'}</strong></div></div>;
  }

  function NextAction({ c }) {
    const status=statusFor(c.id)[2], missing=missingFor(c);
    if(['waiting','filling'].includes(status)) return <div className="empty" style={{padding:12}}><div className="iconwrap"><Icon name="file"/></div><strong>{missing.length?'Envio incompleto':'Aguardando confirmação'}</strong><p>{missing.length?missing.join(' • '):'Os dados estão preenchidos, mas o cliente ainda não concluiu o envio.'}</p><button className="btn btn-secondary" onClick={()=>previewClient(c.id)}><Icon name="eye"/>Ver como cliente</button></div>;
    if(status==='ready') return <div className="empty" style={{padding:12}}><div className="iconwrap"><Icon name="check"/></div><strong>Pronto para análise</strong><p>O cliente confirmou os dados desta competência.</p><button className="btn btn-primary" onClick={()=>setTab('closing')}>Analisar mês</button><button className="btn btn-ghost" onClick={()=>reopenSubmission(c.id)}>Reabrir envio</button></div>;
    if(status==='analysis') return <div className="empty" style={{padding:12}}><div className="iconwrap"><Icon name="edit"/></div><strong>Análise em andamento</strong><p>Existe um rascunho salvo.</p><button className="btn btn-primary" onClick={()=>setTab('closing')}>Continuar análise</button></div>;
    return <div className="empty" style={{padding:12}}><div className="iconwrap"><Icon name="lock"/></div><strong>Mês fechado</strong><p>A competência está bloqueada para alterações.</p><button className="btn btn-secondary" onClick={()=>setTab('closing')}>Ver fechamento</button></div>;
  }

  function Overview({ c }) {
    const t=totals(c.id), p=totals(c.id,previousMonth(state.month)), cr=change(t.rev,p.rev), ce=change(t.exp,p.exp);
    const signals=[];
    if(cr!==null) signals.push({kind:cr>=0?'good':'warn',title:`Receitas ${cr>=0?'subiram':'caíram'} ${percent(Math.abs(cr))}`,text:`Comparação com ${monthName(previousMonth(state.month)).toLowerCase()}.`});
    if(c.expenseEnabled&&ce!==null) signals.push({kind:ce>10?'warn':'info',title:`Despesas registradas ${ce>=0?'subiram':'caíram'} ${percent(Math.abs(ce))}`,text:'Compare a variação com o comportamento das receitas.'});
    if(c.expenseEnabled&&t.rev>0) signals.push({kind:t.expenseRatio<=80?'info':'warn',title:`Despesas representam ${percent(t.expenseRatio)} das receitas`,text:`Saldo financeiro do período: ${money(t.balance)}. Este indicador não representa lucro contábil.`});
    if(!signals.length) signals.push({kind:'info',title:'Sem comparação disponível',text:'Insira dados do mês anterior para gerar sinais automáticos.'});
    return <><Summary c={c}/><div className="grid sectiongrid"><section className="panel span8"><div className="panelhead"><div><h3>Sinais da competência</h3><p>Leitura baseada somente no nível de controle configurado.</p></div></div><div className="panelbody">{signals.map((s,i)=><div className="signal" key={i}><div className={`signalicon ${s.kind}`}><Icon name={s.kind==='good'?'check':s.kind==='warn'?'alert':'chart'}/></div><div><strong>{s.title}</strong><p>{s.text}</p></div></div>)}</div></section><section className="panel span4"><div className="panelhead"><div><h3>Próxima ação</h3><p>Fluxo do acompanhamento</p></div></div><div className="panelbody"><NextAction c={c}/></div></section></div></>;
  }

  function Entries({ c,type }) {
    const revenue=type==='revenue', mode=revenue?c.revenueMode:c.expenseMode, list=[...entriesFor(c.id,type)].sort((a,b)=>(b.date||'').localeCompare(a.date||'')), total=list.reduce((s,e)=>s+Number(e.amount||0),0), locked=isLocked(c.id), closed=isClosed(c.id);
    const buttonText=mode==='monthly'?(revenue?'Informar mês':'Informar total'):mode==='daily'?'Informar dia':mode==='category'?'Informar categoria':revenue?'Nova receita':'Nova despesa';
    return <>{locked&&<div className="lockbar"><div><Icon name="lock"/></div><div style={{flex:1}}><strong>{closed?'Competência fechada':'Envio concluído'}</strong><p>{closed?'Os lançamentos estão bloqueados. Reabra a competência para alterar.':'Os dados foram confirmados pelo cliente e estão bloqueados.'}</p></div></div>}<div className="pagehead"><div><h1 style={{fontSize:21}}>{revenue?'Receitas':'Despesas'}</h1><p>{modeName(mode)} • {monthName(state.month)}</p></div>{!locked&&<button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:type})}><Icon name="plus"/>{buttonText}</button>}</div><section className="panel"><div className="panelhead"><div><h3>Total: {money(total)}</h3><p>{list.length} registro(s) nesta competência</p></div><span className="badge">{modeName(mode)}</span></div>{list.length?<div className="tablewrap"><table><thead><tr><th>{mode==='category'?'Categoria':'Data'}</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th/></tr></thead><tbody>{list.map(e=><tr key={e.id}><td>{mode==='category'?e.category:formatDate(e.date)}</td><td>{e.description}</td><td>{e.category}</td><td><b>{money(e.amount)}</b></td><td>{!locked&&<button className="iconbtn dangertext" onClick={()=>deleteEntry(e.id)}><Icon name="trash"/></button>}</td></tr>)}</tbody></table></div>:<div className="empty"><div className="iconwrap"><Icon name={revenue?'money':'file'}/></div><strong>Nenhum dado informado</strong><p>Adicione o primeiro registro desta competência.</p>{!locked&&<button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:type})}>Adicionar agora</button>}</div>}</section></>;
  }

  function Closing({ c }) {
    const closing=closingFor(c.id)||{}, submitted=!!submissionFor(c.id), closed=isClosed(c.id), t=totals(c.id), p=totals(c.id,previousMonth(state.month));
    const chips=[]; const cr=change(t.rev,p.rev); if(cr!==null) chips.push(`Receitas ${cr>=0?'+':''}${percent(cr)} vs. mês anterior`); if(c.expenseEnabled){const ce=change(t.exp,p.exp);if(ce!==null)chips.push(`Despesas ${ce>=0?'+':''}${percent(ce)} vs. mês anterior`);if(t.rev){chips.push(`Despesas / receitas ${percent(t.expenseRatio)}`);chips.push(`Saldo do período ${money(t.balance)}`)}}
    const status=statusFor(c.id)[2], idx=({waiting:0,filling:0,ready:1,analysis:2,closed:3})[status]??0;
    const stepData=[['Dados do cliente','Movimentações da competência.'],['Envio confirmado','Cliente concluiu e confirmou os dados.'],['Análise','Conferência e leitura do mês.'],['Fechamento concluído','Competência bloqueada e consolidada.']];
    return <><Summary c={c}/>{!submitted&&!closed&&<div className="lockbar"><div><Icon name="alert"/></div><div style={{flex:1}}><strong>Aguardando conclusão do envio</strong><p>{missingFor(c).length?missingFor(c).join(' • '):'Os dados estão preenchidos, mas o cliente ainda precisa confirmar o envio.'}</p></div><button className="btn btn-secondary" onClick={()=>previewClient(c.id)}>Ver como cliente</button></div>}<div className="grid sectiongrid"><section className="panel span8"><div className="panelhead"><div><h3>Análise do mês</h3><p>Os indicadores respeitam o nível de controle configurado.</p></div></div><form className="panelbody" onSubmit={e=>saveClosing(e,c.id)}><div className="chips" style={{marginBottom:15}}>{chips.length?chips.map(x=><span className="chip active" key={x}>{x}</span>):<span className="tiny">Sem base comparativa suficiente.</span>}</div><div className="field"><label>O que aconteceu neste mês?</label><textarea name="analysis" className="textarea" defaultValue={closing.analysis||''}/></div><div className="field"><label>Pontos de atenção</label><textarea name="attention" className="textarea" defaultValue={closing.attention||''}/></div><div className="field"><label>Recomendações</label><textarea name="recommendation" className="textarea" defaultValue={closing.recommendation||''}/></div><div className="actions" style={{justifyContent:'flex-end'}}>{closed?<><button type="button" className="btn btn-secondary" onClick={()=>reopenClosing(c.id)}>Reabrir competência</button><button className="btn btn-primary" name="intent" value="close">Atualizar análise</button></>:<><button className="btn btn-secondary" name="intent" value="draft">Salvar rascunho</button><button className="btn btn-primary" name="intent" value="close"><Icon name="lock"/>Fechar mês</button></>}</div></form></section><section className="panel span4"><div className="panelhead"><div><h3>Etapas</h3><p>Status desta competência</p></div></div><div className="panelbody"><div className="steps">{stepData.map((x,i)=><div className="step" key={x[0]}><div className={`stepdot ${i<idx?'done':i===idx?'current':''}`}>{i<idx?'✓':i+1}</div><div><strong>{x[0]}</strong><p>{x[1]}</p></div></div>)}</div></div></section></div></>;
  }

  function Config({ c }) {
    const categorySection = type => {
      const revenue=type==='revenue', base=revenue?DEFAULT_REVENUE_CATEGORIES:DEFAULT_EXPENSE_CATEGORIES, custom=revenue?(c.customRevenueCategories||[]):(c.customExpenseCategories||[]);
      return <div className="categorybox"><h4>Categorias de {revenue?'receitas':'despesas'}</h4><p>Categorias padrão + categorias específicas desta empresa.</p><div className="categorylist">{base.map(x=><span className="categorytag" key={x}>{x}</span>)}{custom.map(x=><span className="categorytag custom" key={x}>{x}<button onClick={()=>removeCategory(c.id,type,x)}>×</button></span>)}</div><form className="inlineadd" onSubmit={e=>addCategory(e,c.id,type)}><input name="category" className="input" placeholder="Nova categoria"/><button className="btn btn-secondary">Adicionar</button></form></div>;
    };
    return <div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Configuração do acompanhamento</h3><p>O nível de controle define os lançamentos e os indicadores exibidos.</p></div></div><div className="panelbody"><div className="setting"><div><h4>Receitas / vendas</h4><p>Escolha o nível de detalhe adequado à rotina do cliente.</p></div><div className="settingactions"><select className="select mode" value={c.revenueMode} onChange={e=>updateCompany(c.id,'revenueMode',e.target.value)}><option value="monthly">Resumo mensal</option><option value="daily">Resumo diário</option><option value="individual">Venda por venda</option></select><span className="badge">Ativo</span></div></div><div className="setting"><div><h4>Despesas</h4><p>Ative apenas quando o cliente realmente quiser acompanhar gastos.</p></div><div className="settingactions"><select className="select mode" value={c.expenseMode} disabled={!c.expenseEnabled} onChange={e=>updateCompany(c.id,'expenseMode',e.target.value)}><option value="monthly">Total mensal</option><option value="category">Por categoria</option><option value="individual">Lançamento individual</option></select><button className={`switch ${c.expenseEnabled?'on':''}`} onClick={()=>toggleExpense(c.id)}/></div></div>{categorySection('revenue')}{c.expenseEnabled&&categorySection('expense')}</div></section><section className="panel span5"><div className="panelhead"><div><h3>Acesso do cliente</h3><p>Prévia do modelo de permissões.</p></div></div><div className="panelbody"><div className="field"><label>E-mail principal</label><input className="input" value={c.contact||''} onChange={e=>updateCompany(c.id,'contact',e.target.value)}/></div><div className="field"><label>Perfil</label><input className="input" value="Administrador da empresa" disabled readOnly/></div><button className="btn btn-primary btn-block" onClick={()=>previewClient(c.id)}><Icon name="eye"/>Visualizar área do cliente</button><div className="notice">Na integração com Supabase, cada pessoa terá login próprio e verá somente as empresas às quais estiver vinculada.</div></div></section></div>;
  }

  function Workspace({ c }) {
    const status=statusFor(c.id), tabs=[['overview','Visão geral'],['revenue','Receitas']]; if(c.expenseEnabled)tabs.push(['expense','Despesas']);tabs.push(['closing','Fechamento'],['config','Configuração']);
    let body=<Overview c={c}/>; if(state.tab==='revenue')body=<Entries c={c} type="revenue"/>; if(state.tab==='expense')body=<Entries c={c} type="expense"/>; if(state.tab==='closing')body=<Closing c={c}/>; if(state.tab==='config')body=<Config c={c}/>;
    return <><button className="btn btn-ghost" style={{paddingLeft:0,marginBottom:8}} onClick={()=>mutate(s=>{s.selectedCompany=null;})}><Icon name="back"/>Voltar</button><div className="companyhero"><div className="companytitle"><div className="avatar">{initials(c.name)}</div><div><h2>{c.name}</h2><p>{c.document} • {c.contact||'Sem e-mail de acesso'}</p></div></div><div className="herometa"><div><span>Modelo</span><strong>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</strong></div><div><span>Status</span><strong>{status[0]}</strong></div><button className="btn btn-secondary" onClick={()=>previewClient(c.id)}><Icon name="eye"/>Ver como cliente</button></div></div><div className="tabs">{tabs.map(([key,label])=><button className={`tab ${state.tab===key?'active':''}`} key={key} onClick={()=>setTab(key)}>{label}</button>)}</div>{body}</>;
  }

  function ClientHome({ c }) {
    const closing=closingFor(c.id), submission=submissionFor(c.id), missing=missingFor(c), closed=isClosed(c.id), locked=isLocked(c.id);
    return <><div className="pagehead"><div><h1>Olá, {c.name.split(' ')[0]}</h1><p>Visão de {monthName(state.month).toLowerCase()}.</p></div>{!locked&&<div className="actions"><button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:'revenue'})}><Icon name="plus"/>Informar receita</button>{c.expenseEnabled&&<button className="btn btn-secondary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:'expense'})}>Informar despesa</button>}</div>}</div><Summary c={c}/><div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Envio da competência</h3><p>Conclua somente depois de conferir todas as informações.</p></div></div><div className="panelbody">{closed?<div className="signal"><div className="signalicon good"><Icon name="lock"/></div><div><strong>Competência concluída</strong><p>Este mês já foi fechado pelo contador.</p></div></div>:submission?<div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Dados enviados</strong><p>Se precisar corrigir algo, solicite a reabertura ao contador.</p></div></div>:<><div className="signal"><div className={`signalicon ${missing.length?'warn':'info'}`}><Icon name={missing.length?'alert':'check'}/></div><div><strong>{missing.length?'Ainda falta informação':'Pronto para concluir'}</strong><p>{missing.length?missing.join(' • '):'Os módulos ativos possuem dados registrados.'}</p></div></div><button className="btn btn-primary btn-block" disabled={!!missing.length} onClick={()=>confirmSubmission(c.id)}><Icon name="check"/>Confirmar dados de {monthName(state.month)}</button></>}</div></section><section className="panel span5"><div className="panelhead"><div><h3>Orientação do contador</h3><p>Última análise liberada</p></div></div><div className="panelbody">{closing?.closed?<><div className="signal"><div className="signalicon info"><Icon name="brief"/></div><div><strong>Pontos de atenção</strong><p>{closing.attention||'Sem observações.'}</p></div></div><div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Recomendação</strong><p>{closing.recommendation||'Sem recomendação registrada.'}</p></div></div></>:<div className="empty"><div className="iconwrap"><Icon name="file"/></div><strong>Análise ainda não liberada</strong><p>O fechamento desta competência ainda está em andamento.</p></div>}</div></section></div></>;
  }

  function ClientFollowup({ c }) {
    const closing=closingFor(c.id);
    return <><div className="pagehead"><div><h1>Acompanhamento</h1><p>Orientações liberadas pelo seu contador.</p></div></div><section className="panel"><div className="panelbody">{closing?.closed?<><div className="field"><label>Leitura do mês</label><div className="notice" style={{margin:0,color:'var(--text)',background:'#FAFBFD',borderColor:'var(--border)'}}>{closing.analysis||'Sem análise registrada.'}</div></div><div className="field"><label>Pontos de atenção</label><div className="notice" style={{margin:0,color:'var(--text)',background:'#FAFBFD',borderColor:'var(--border)'}}>{closing.attention||'Sem pontos registrados.'}</div></div><div className="field"><label>Recomendação</label><div className="notice" style={{margin:0,color:'var(--text)',background:'#FAFBFD',borderColor:'var(--border)'}}>{closing.recommendation||'Sem recomendação registrada.'}</div></div></>:<div className="empty"><div className="iconwrap"><Icon name="file"/></div><strong>Fechamento em andamento</strong><p>Quando a análise for concluída, ela aparecerá aqui.</p></div>}</div></section></>;
  }

  function ClientShell({ c }) {
    const tabs=[['overview','home','Início'],['revenue','money','Receitas']];if(c.expenseEnabled)tabs.push(['expense','file','Despesas']);tabs.push(['closing','chart','Acompanhamento']);
    let body=<ClientHome c={c}/>;if(state.tab==='revenue')body=<Entries c={c} type="revenue"/>;if(state.tab==='expense')body=<Entries c={c} type="expense"/>;if(state.tab==='closing')body=<ClientFollowup c={c}/>;
    return <div className="shell client-shell"><aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Meu Financeiro</div><div className="navtitle">{c.name}</div>{tabs.map(([key,icon,label])=><button key={key} className={`navbtn ${state.tab===key?'active':''}`} onClick={()=>setTab(key)}><Icon name={icon}/>{label}</button>)}<div className="sidebottom"><div className="usercard"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>Área do cliente</span></div></div><button className="navbtn" onClick={()=>mutate(s=>{s.role='master';})}><Icon name="back"/>Voltar ao Master</button></div></aside><main className="main"><header className="topbar"><div className="crumb"><strong>{c.name}</strong></div><div className="topright">{monthControl}<div className="avatar">{initials(c.name)}</div></div></header><div className="content"><div className="client-banner"><span><b>Prévia do cliente:</b> você está vendo exatamente o que esta empresa veria.</span><button className="btn btn-secondary" onClick={()=>mutate(s=>{s.role='master';})}>Sair da prévia</button></div>{body}</div></main></div>;
  }

  function saveClosing(e,id){e.preventDefault();if(!submissionFor(id)&&!isClosed(id)){setToast('O cliente ainda não confirmou os dados');return}const form=new FormData(e.currentTarget);const intent=e.nativeEvent.submitter?.value||'draft';mutate(s=>{const data={companyId:id,month:s.month,analysis:form.get('analysis'),attention:form.get('attention'),recommendation:form.get('recommendation'),closed:intent==='close'};const old=s.closings.find(x=>x.companyId===id&&x.month===s.month);if(old)Object.assign(old,data);else s.closings.push(data);});setToast(intent==='close'?'Mês fechado e bloqueado':'Rascunho salvo');}
  function reopenSubmission(id){if(isClosed(id))return; if(!confirm('Reabrir o envio?'))return;mutate(s=>{s.submissions=s.submissions.filter(x=>!(x.companyId===id&&x.month===s.month));});setToast('Envio reaberto');}
  function reopenClosing(id){if(!confirm('Reabrir esta competência?'))return;mutate(s=>{const cl=s.closings.find(x=>x.companyId===id&&x.month===s.month);if(cl)cl.closed=false;s.submissions=s.submissions.filter(x=>!(x.companyId===id&&x.month===s.month));});setToast('Competência reaberta');}
  function confirmSubmission(id){if(missingFor(company(id)).length)return;if(!confirm(`Confirmar os dados de ${monthName(state.month)}?`))return;mutate(s=>{s.submissions=s.submissions.filter(x=>!(x.companyId===id&&x.month===s.month));s.submissions.push({companyId:id,month:s.month,confirmedAt:new Date().toISOString()});});setToast('Dados confirmados e enviados');}
  function updateCompany(id,key,value){mutate(s=>{const c=s.companies.find(x=>x.id===id);c[key]=value;});}
  function toggleExpense(id){mutate(s=>{const c=s.companies.find(x=>x.id===id);c.expenseEnabled=!c.expenseEnabled;if(!c.expenseEnabled&&s.tab==='expense')s.tab='overview';});}
  function addCategory(e,id,type){e.preventDefault();const form=new FormData(e.currentTarget),value=String(form.get('category')||'').trim();if(!value)return;const c=company(id),all=categoriesFor(c,type).map(x=>x.toLowerCase());if(all.includes(value.toLowerCase())){setToast('Essa categoria já existe');return}mutate(s=>{const target=s.companies.find(x=>x.id===id),key=type==='revenue'?'customRevenueCategories':'customExpenseCategories';target[key]=[...(target[key]||[]),value];});e.currentTarget.reset();setToast('Categoria adicionada');}
  function removeCategory(id,type,name){mutate(s=>{const target=s.companies.find(x=>x.id===id),key=type==='revenue'?'customRevenueCategories':'customExpenseCategories';target[key]=(target[key]||[]).filter(x=>x!==name);});}
  function deleteEntry(id){if(!confirm('Excluir este lançamento?'))return;mutate(s=>{s.entries=s.entries.filter(e=>e.id!==id);});setToast('Lançamento excluído');}
  function submitCompany(e){e.preventDefault();const f=new FormData(e.currentTarget),id=`c${Date.now()}`;mutate(s=>{s.companies.push({id,name:f.get('name'),document:f.get('document')||'Não informado',contact:f.get('contact')||'',revenueMode:f.get('revenueMode'),expenseEnabled:f.get('expenseEnabled')==='true',expenseMode:'category',customRevenueCategories:[],customExpenseCategories:[]});s.selectedCompany=id;s.tab='config';s.role='master';});setModal(null);setToast('Cliente criado');}
  function submitEntry(e){e.preventDefault();const {companyId,entryType}=modal,c=company(companyId),revenue=entryType==='revenue',mode=revenue?c.revenueMode:c.expenseMode,f=new FormData(e.currentTarget),amount=Number(f.get('amount')),date=f.get('date')||`${state.month}-01`,category=f.get('category')||(revenue?'Receitas':'Despesas'),description=f.get('description')||(mode==='category'?category:`Total de ${monthName(state.month).toLowerCase()}`);mutate(s=>{let existing=null;if(mode==='monthly')existing=s.entries.find(x=>x.companyId===companyId&&x.type===entryType&&(x.month||x.date?.slice(0,7))===s.month&&x.mode==='monthly');if(mode==='daily')existing=s.entries.find(x=>x.companyId===companyId&&x.type===entryType&&x.date===date&&x.mode==='daily');if(mode==='category')existing=s.entries.find(x=>x.companyId===companyId&&x.type===entryType&&(x.month||x.date?.slice(0,7))===s.month&&x.category===category&&x.mode==='category');const data={companyId,type:entryType,month:s.month,date,description,category,amount,mode};if(existing)Object.assign(existing,data);else s.entries.push({id:`e${Date.now()}`,...data});});setModal(null);setToast('Informação salva');}

  function Modal() {
    if(!modal)return null;
    if(modal.type==='company') return <div className="modalback"><div className="modal"><div className="modalhead"><h3>Novo cliente</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><form onSubmit={submitCompany}><div className="modalbody"><div className="formgrid"><div className="field full"><label>Nome da empresa</label><input name="name" className="input" required/></div><div className="field"><label>CNPJ / CPF</label><input name="document" className="input"/></div><div className="field"><label>E-mail de acesso</label><input name="contact" type="email" className="input"/></div><div className="field"><label>Receitas</label><select name="revenueMode" className="select"><option value="monthly">Resumo mensal</option><option value="daily">Resumo diário</option><option value="individual">Venda por venda</option></select></div><div className="field"><label>Despesas</label><select name="expenseEnabled" className="select"><option value="false">Não acompanhar</option><option value="true">Acompanhar</option></select></div></div><div className="notice">Você poderá alterar o nível de controle depois.</div></div><div className="modalfoot"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary">Criar cliente</button></div></form></div></div>;
    const c=company(modal.companyId), revenue=modal.entryType==='revenue', mode=revenue?c.revenueMode:c.expenseMode, monthly=mode==='monthly', daily=mode==='daily', categoryMode=mode==='category', cats=categoriesFor(c,modal.entryType), defaultDate=`${state.month}-${String(Math.min(new Date().getDate(),28)).padStart(2,'0')}`;
    return <div className="modalback"><div className="modal"><div className="modalhead"><h3>{revenue?'Informar receita':'Informar despesa'}</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><form onSubmit={submitEntry}><div className="modalbody"><div className="formgrid">{!monthly&&!categoryMode&&<div className="field"><label>Data</label><input name="date" type="date" className="input" defaultValue={defaultDate} required/></div>}<div className={`field ${monthly||categoryMode?'full':''}`}><label>Valor</label><input name="amount" type="number" min="0" step="0.01" className="input" required/></div>{categoryMode?<div className="field full"><label>Categoria</label><select name="category" className="select">{cats.map(x=><option key={x}>{x}</option>)}</select></div>:mode==='individual'?<><div className="field full"><label>Descrição</label><input name="description" className="input" required/></div><div className="field full"><label>Categoria</label><select name="category" className="select">{cats.map(x=><option key={x}>{x}</option>)}</select></div></>:daily?<div className="field full"><label>Descrição</label><input name="description" className="input" defaultValue="Total do dia"/></div>:null}</div></div><div className="modalfoot"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary">Salvar</button></div></form></div></div>;
  }

  if(state.role==='client'&&currentCompany) return <><ClientShell c={currentCompany}/><Modal/>{toast&&<div className="toast">{toast}</div>}</>;

  let content=<Dashboard/>; if(state.view==='companies')content=<Companies/>;if(state.view==='closings')content=<Closings/>;if(state.view==='settings')content=<Settings/>;if(currentCompany)content=<Workspace c={currentCompany}/>;
  return <><div className="shell">{masterSidebar}<main className="main"><header className="topbar"><div className="crumb">Central Financeira <span>›</span><strong>{currentCompany?currentCompany.name:titleView}</strong></div><div className="topright">{monthControl}<div className="avatar">LG</div></div></header><div className="content">{content}</div></main></div><Modal/>{toast&&<div className="toast">{toast}</div>}</>;
}
