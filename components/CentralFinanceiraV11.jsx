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
import styles from './CentralFinanceiraV11.module.css';

const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const monthName = key => {
  const [y,m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).replace(/^./, c => c.toUpperCase());
};
const formatDate = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const initials = name => String(name || 'LG').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const modeName = mode => ({monthly:'Resumo mensal',daily:'Resumo diário',individual:'Lançamento individual',category:'Por categoria'})[mode] || mode;

function Icon({ name }) {
  const common={className:'icon',viewBox:'0 0 24 24','aria-hidden':true};
  const p={
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

const defaultDraft=()=>({name:'',document:'',contact:'',revenueMode:'monthly',expenseEnabled:false,expenseMode:'category'});

export default function CentralFinanceiraV11(){
  const session=neonTest.auth.useSession();
  const user=session.data?.user || null;
  const activeOrganizationId=session.data?.session?.activeOrganizationId || null;
  const [state,setState]=useState(null);
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [authBusy,setAuthBusy]=useState(false);
  const [companyStep,setCompanyStep]=useState(1);
  const [companyDraft,setCompanyDraft]=useState(defaultDraft());

  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(id)},[toast]);

  const refresh=useCallback(async(preserve=true)=>{
    if(!user)return;
    setError('');
    try{
      const data=await loadCentralData(activeOrganizationId);
      if(data.reload){window.location.reload();return}
      setState(current=>{
        const old=preserve?current:null;
        const baseRole=data.systemRole==='super_admin'?'master':'client';
        const selected=old?.selectedCompany && data.companies.some(c=>c.id===old.selectedCompany)
          ? old.selectedCompany
          : baseRole==='client' ? (data.companies[0]?.id || null) : null;
        return {
          view:old?.view||'dashboard',selectedCompany:selected,tab:old?.tab||'overview',month:old?.month||data.month,
          filter:old?.filter||'all',search:old?.search||'',role:old?.role && data.systemRole==='super_admin'?old.role:baseRole,
          systemRole:data.systemRole,companies:data.companies,entries:data.entries,submissions:data.submissions,closings:data.closings,categoryRows:data.categoryRows
        };
      });
    }catch(e){setError(normalizeError(e))}
  },[user?.id,activeOrganizationId]);

  useEffect(()=>{if(session.isPending)return;if(!user){setState(null);return}refresh(false)},[session.isPending,user?.id,refresh]);

  const mutate=fn=>setState(current=>{if(!current)return current;const next={...current};fn(next);return next});
  const run=async(action,success,{refreshAfter=true}={})=>{
    setBusy(true);setError('');
    try{const result=await action();if(refreshAfter)await refresh(true);if(success)setToast(success);return result}
    catch(e){const message=normalizeError(e);setError(message);setToast(message);return null}
    finally{setBusy(false)}
  };

  async function signIn(e){
    e.preventDefault();setAuthBusy(true);setError('');
    const f=new FormData(e.currentTarget);
    try{
      const result=await neonTest.auth.signIn.email({email:String(f.get('email')||'').trim(),password:String(f.get('password')||'')});
      if(result?.error)throw result.error;window.location.reload();
    }catch(e){setError(normalizeError(e));setAuthBusy(false)}
  }
  async function signOut(){setBusy(true);try{await neonTest.auth.signOut();window.location.reload()}finally{setBusy(false)}}

  if(session.isPending)return <div className="empty"><strong>Validando acesso…</strong></div>;
  if(!user)return <div className="login">
    <section className="login-hero">
      <div className="brand"><div className="brandmark">LG</div>Central Financeira</div>
      <div className="login-copy"><small>ACOMPANHAMENTO FINANCEIRO</small><h1>Controle do que importa, no nível certo para cada empresa.</h1><p>Receitas, despesas quando fizer sentido, fechamento mensal e acompanhamento em uma rotina simples para você e para o cliente.</p></div>
      <div style={{fontSize:11,color:'#9FB2E1'}}>Central Financeira • Contador Luid Gabriel</div>
    </section>
    <section className="login-side"><div className="login-card"><h2>Acessar plataforma</h2><p>Entre com seu e-mail e senha.</p><form onSubmit={signIn}><div className="field"><label>E-mail</label><input name="email" className="input" type="email" required autoComplete="email"/></div><div className="field"><label>Senha</label><input name="password" className="input" type="password" minLength={8} required autoComplete="current-password"/></div><button className="btn btn-primary btn-block" disabled={authBusy}>{authBusy?'Entrando…':'Entrar'} <Icon name="arrow"/></button></form>{error&&<div className="notice" style={{color:'var(--danger)',borderColor:'#F2C9C5'}}>{error}</div>}<div className="notice"><b>Versão de validação:</b> use apenas informações fictícias por enquanto.</div></div></section>
  </div>;

  if(!state)return <div className="empty"><strong>Carregando sua Central Financeira…</strong>{error&&<p>{error}</p>}</div>;

  const company=id=>state.companies.find(c=>c.id===id);
  const entriesFor=(id,type,month=state.month)=>state.entries.filter(e=>e.companyId===id&&(!type||e.type===type)&&e.month===month);
  const totals=(id,month=state.month)=>{const rev=entriesFor(id,'revenue',month).reduce((s,e)=>s+Number(e.amount||0),0);const exp=entriesFor(id,'expense',month).reduce((s,e)=>s+Number(e.amount||0),0);return{rev,exp,balance:rev-exp,expenseRatio:rev?exp/rev*100:0}};
  const closingFor=(id,month=state.month)=>state.closings.find(x=>x.companyId===id&&x.month===month);
  const submissionFor=(id,month=state.month)=>state.submissions.find(x=>x.companyId===id&&x.month===month);
  const isClosed=(id,month=state.month)=>!!closingFor(id,month)?.closed;
  const isLocked=(id,month=state.month)=>isClosed(id,month)||!!submissionFor(id,month);
  const missingFor=(c,month=state.month)=>{const missing=[];if(!entriesFor(c.id,'revenue',month).length)missing.push('Receitas');if(c.expenseEnabled&&!entriesFor(c.id,'expense',month).length)missing.push('Despesas');return missing};
  const statusFor=(id,month=state.month)=>{const closing=closingFor(id,month),submission=submissionFor(id,month);if(closing?.closed)return['Fechado','closed','closed'];if(submission&&closing)return['Em análise','info','analysis'];if(submission)return['Pronto para análise','ok','ready'];if(entriesFor(id,null,month).length)return['Preenchendo dados','info','filling'];return['Aguardando dados','wait','waiting']};
  const pendingText=c=>{if(isClosed(c.id))return'Mês concluído';if(submissionFor(c.id))return closingFor(c.id)?'Análise em andamento':'Aguardando sua análise';const missing=missingFor(c);return missing.length?`Falta informar: ${missing.join(' e ')}`:'Aguardando confirmação'};
  const categoriesFor=(c,type)=>[...new Set([...(type==='revenue'?DEFAULT_REVENUE_CATEGORIES:DEFAULT_EXPENSE_CATEGORIES),...(type==='revenue'?(c.customRevenueCategories||[]):(c.customExpenseCategories||[]))])];
  const currentCompany=company(state.selectedCompany);
  const isMaster=state.systemRole==='super_admin';
  const allRows=state.companies.map(c=>({...c,...totals(c.id),status:statusFor(c.id)}));

  const setView=view=>mutate(s=>{s.view=view;s.selectedCompany=null;s.role=isMaster?'master':'client'});
  const openCompany=(id,tab='overview')=>mutate(s=>{s.selectedCompany=id;s.tab=tab;s.role='master'});
  const setTab=tab=>mutate(s=>{s.tab=tab});
  const moveMonth=direction=>mutate(s=>{s.month=direction<0?previousMonth(s.month):nextMonth(s.month)});
  const previewClient=id=>{if(!isMaster)return;mutate(s=>{s.role='preview';s.selectedCompany=id;s.tab='overview'})};
  const monthControl=<div className="monthctl"><button onClick={()=>moveMonth(-1)}>‹</button><div className="monthlabel">{monthName(state.month)}</div><button onClick={()=>moveMonth(1)}>›</button></div>;

  function openCompanyWizard(){setCompanyDraft(defaultDraft());setCompanyStep(1);setModal({type:'company'})}

  async function createCompanyFromWizard(){
    if(!companyDraft.name.trim())return;
    setBusy(true);setError('');
    try{
      const id=await createNeonCompany({name:companyDraft.name.trim(),document:companyDraft.document.trim(),contact:companyDraft.contact.trim(),revenueMode:companyDraft.revenueMode,expenseEnabled:companyDraft.expenseEnabled});
      if(companyDraft.expenseEnabled&&companyDraft.expenseMode!=='category')await updateOrganizationSettings(id,{expenseMode:companyDraft.expenseMode});
      await refresh(false);setModal(null);setCompanyStep(1);setCompanyDraft(defaultDraft());setToast('Cliente criado e acompanhamento configurado');
    }catch(e){const message=normalizeError(e);setError(message);setToast(message)}finally{setBusy(false)}
  }

  async function submitEntry(e){
    e.preventDefault();
    const c=company(modal.companyId);const type=modal.entryType;const revenue=type==='revenue';const mode=revenue?c.revenueMode:c.expenseMode;const f=new FormData(e.currentTarget);
    const amount=Number(f.get('amount'));const date=String(f.get('date')||`${state.month}-01`);const category=String(f.get('category')||(revenue?'Receitas':'Despesas'));const description=String(f.get('description')||(mode==='category'?category:`Total de ${monthName(state.month).toLowerCase()}`));
    let existingId=modal.entry?.id||null;
    if(!existingId&&mode==='monthly')existingId=entriesFor(c.id,type).find(x=>x.mode==='monthly')?.id||null;
    if(!existingId&&mode==='daily')existingId=entriesFor(c.id,type).find(x=>x.mode==='daily'&&String(x.date).slice(0,10)===date)?.id||null;
    if(!existingId&&mode==='category')existingId=entriesFor(c.id,type).find(x=>x.mode==='category'&&x.category===category)?.id||null;
    await run(async()=>{
      const categoryId=await ensureCategory(state.categoryRows,c.id,type,category);
      return saveFinancialEntry({existingId,organizationId:c.id,competency:state.month,occurredOn:date,type,description,categoryId,amount,mode});
    },modal.entry?'Lançamento atualizado':'Informação salva');
    setModal(null);
  }

  async function deleteEntry(entry){if(!confirm('Excluir este lançamento?'))return;await run(()=>deleteFinancialEntry(entry.id),'Lançamento excluído')}
  async function changeSetting(id,key,value){await run(()=>updateOrganizationSettings(id,{[key]:value}),'Configuração atualizada')}
  async function saveCompanyMetadata(e,c){e.preventDefault();const f=new FormData(e.currentTarget);await run(()=>updateCompanyMetadata(c,{document:String(f.get('document')||'').trim(),contact:String(f.get('contact')||'').trim()}),'Dados atualizados')}
  async function addCategory(e,id,type){e.preventDefault();const f=new FormData(e.currentTarget),name=String(f.get('category')||'').trim();if(!name)return;const c=company(id);if(categoriesFor(c,type).some(x=>x.toLowerCase()===name.toLowerCase()))return setToast('Essa categoria já existe');await run(()=>addNeonCategory(id,type,name,false),'Categoria adicionada');e.currentTarget.reset()}
  async function removeCategory(id,type,name){await run(()=>deactivateCategory(id,type,name),'Categoria removida')}
  async function submitClosing(e,id){e.preventDefault();if(!submissionFor(id)&&!isClosed(id))return setToast('O cliente ainda não confirmou os dados');const f=new FormData(e.currentTarget),intent=e.nativeEvent.submitter?.value||'draft';await run(()=>saveMonthlyClosing({organizationId:id,month:state.month,analysis:String(f.get('analysis')||''),attention:String(f.get('attention')||''),recommendation:String(f.get('recommendation')||''),close:intent==='close'}),intent==='close'?'Mês fechado e bloqueado':'Rascunho salvo')}
  async function reopenSubmission(id){if(isClosed(id))return;if(!confirm('Reabrir o envio desta competência?'))return;await run(()=>reopenMonthSubmission(id,state.month),'Envio reaberto')}
  async function reopenClosing(id){if(!confirm('Reabrir esta competência?'))return;await run(()=>reopenMonthlyClosing(id,state.month),'Competência reaberta')}

  function CompanyTable({rows}){
    if(!rows.length)return <div className="empty"><div className="iconwrap"><Icon name="search"/></div><strong>Nenhum cliente encontrado</strong><p>Ajuste a busca ou os filtros.</p></div>;
    return <table><thead><tr><th>Cliente</th><th>Status</th><th>Pendência</th><th>Modelo</th><th/></tr></thead><tbody>{rows.map(c=><tr key={c.id} className="clickable" onClick={()=>openCompany(c.id)}><td><div className="companycell"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>{c.document||'Sem documento'}</span></div></div></td><td><span className={`status ${c.status[1]}`}>{c.status[0]}</span></td><td><span className="pendingtext">{pendingText(c)}</span></td><td>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</td><td><Icon name="arrow"/></td></tr>)}</tbody></table>;
  }

  function Dashboard(){
    const total=allRows.length;const waiting=allRows.filter(x=>['waiting','filling'].includes(x.status[2])).length;const ready=allRows.filter(x=>x.status[2]==='ready').length;const analysis=allRows.filter(x=>x.status[2]==='analysis').length;const closed=allRows.filter(x=>x.status[2]==='closed').length;
    const kpi=(icon,label,value,foot)=><div className="card kpi"><div className="kpitop"><span className="kpilabel">{label}</span><div className="kpiicon"><Icon name={icon}/></div></div><div className="kpivalue">{value}</div><div className="kpifoot">{foot}</div></div>;
    if(total===0)return <><div className="pagehead"><div><h1>Visão geral</h1><p>Sua operação financeira começa pela configuração de cada cliente.</p></div></div><section className="panel"><div className={styles.emptyHero}><div className={styles.emptyIcon}><Icon name="users"/></div><h2>Sua Central está pronta</h2><p>Cadastre o primeiro cliente e escolha apenas o que ele realmente precisa controlar. O acompanhamento será montado a partir dessa configuração.</p><button className="btn btn-primary" onClick={openCompanyWizard}><Icon name="plus"/>Cadastrar primeiro cliente</button></div></section></>;
    return <><div className="pagehead"><div><h1>Visão geral</h1><p>Carteira de {monthName(state.month).toLowerCase()} e o que precisa da sua atenção.</p></div><div className="actions"><button className="btn btn-secondary" onClick={()=>refresh(true)} disabled={busy}><Icon name="refresh"/>Atualizar</button><button className="btn btn-primary" onClick={openCompanyWizard}><Icon name="plus"/>Novo cliente</button></div></div><div className="grid kpis">{kpi('users','Clientes ativos',total,'Empresas acompanhadas')}{kpi('alert','Aguardando cliente',waiting,waiting?'Há dados pendentes':'Nenhuma pendência')}{kpi('check','Prontos para análise',ready,'Envio concluído pelo cliente')}{kpi('lock','Fechados',closed,'Competências concluídas')}</div><div className={styles.flowGrid}><section className="panel"><div className="panelhead"><div><h3>Carteira</h3><p>Abra um cliente para ver exatamente o que falta.</p></div><button className="btn btn-secondary" onClick={()=>setView('companies')}>Ver todos</button></div><div className="tablewrap"><CompanyTable rows={allRows.slice(0,7)}/></div></section><section className="panel"><div className="panelhead"><div><h3>Fluxo da competência</h3><p>{closed} de {total} concluídos</p></div></div><div className="panelbody"><div className={styles.flowMini}><div><div className={styles.flowNumber}>{waiting}</div><div className={styles.flowLabel}>Aguardando</div></div><div><div className={styles.flowNumber}>{ready+analysis}</div><div className={styles.flowLabel}>Em andamento</div></div><div><div className={styles.flowNumber}>{closed}</div><div className={styles.flowLabel}>Fechados</div></div></div><div className="progresslist"><div className="progressrow"><span>Aguardando cliente</span><b>{waiting}</b><div className="track"><div className="bar" style={{width:`${total?Math.round(waiting/total*100):0}%`}}/></div></div><div className="progressrow"><span>Prontos / análise</span><b>{ready+analysis}</b><div className="track"><div className="bar" style={{width:`${total?Math.round((ready+analysis)/total*100):0}%`}}/></div></div><div className="progressrow"><span>Fechados</span><b>{closed}</b><div className="track"><div className="bar" style={{width:`${total?Math.round(closed/total*100):0}%`}}/></div></div></div></div></section></div></>;
  }

  function Companies(){let rows=allRows;const q=state.search.toLowerCase().trim();if(q)rows=rows.filter(c=>(`${c.name} ${c.document} ${c.contact}`).toLowerCase().includes(q));if(state.filter!=='all')rows=rows.filter(c=>c.status[2]===state.filter||(state.filter==='progress'&&['ready','analysis'].includes(c.status[2]))||(state.filter==='waiting'&&['waiting','filling'].includes(c.status[2])));return <><div className="pagehead"><div><h1>Clientes</h1><p>Quem precisa enviar dados, quem está pronto e quem já foi fechado.</p></div><button className="btn btn-primary" onClick={openCompanyWizard}><Icon name="plus"/>Novo cliente</button></div><div className="filters" style={{marginBottom:14}}><div className="search"><Icon name="search"/><input className="input" placeholder="Buscar cliente, CNPJ ou e-mail" value={state.search} onChange={e=>mutate(s=>{s.search=e.target.value})}/></div><div className="chips">{[['all','Todos'],['waiting','Aguardando'],['progress','Em andamento'],['closed','Fechados']].map(([key,label])=><button key={key} className={`chip ${state.filter===key?'active':''}`} onClick={()=>mutate(s=>{s.filter=key})}>{label}</button>)}</div></div><section className="panel"><div className="panelhead"><div><h3>{rows.length} empresa(s)</h3><p>Competência: {monthName(state.month)}</p></div></div>{rows.length?<div className="tablewrap"><CompanyTable rows={rows}/></div>:<div className={styles.emptyHero}><div className={styles.emptyIcon}><Icon name="search"/></div><h2>Nenhum resultado</h2><p>Não encontramos clientes com esses filtros.</p></div>}</section></>}

  function Closings(){return <><div className="pagehead"><div><h1>Fechamentos</h1><p>Acompanhe o estágio mensal de cada cliente.</p></div></div><section className="panel"><div className="tablewrap"><table><thead><tr><th>Cliente</th><th>Modelo</th><th>Status</th><th>Pendência</th><th/></tr></thead><tbody>{allRows.map(c=><tr key={c.id} className="clickable" onClick={()=>openCompany(c.id,'closing')}><td><strong>{c.name}</strong></td><td>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</td><td><span className={`status ${c.status[1]}`}>{c.status[0]}</span></td><td>{pendingText(c)}</td><td><Icon name="arrow"/></td></tr>)}</tbody></table></div></section></>}

  function Summary({c}){
    const t=totals(c.id),submission=submissionFor(c.id);const revNoMove=submission?.revenueNoMovement&&!entriesFor(c.id,'revenue').length;const expNoMove=submission?.expenseNoMovement&&!entriesFor(c.id,'expense').length;
    if(!c.expenseEnabled)return <div className="summary"><div className="summaryitem"><span>Receitas</span><strong>{revNoMove?'Sem movimento':money(t.rev)}</strong></div><div className="summaryitem"><span>Registros</span><strong>{entriesFor(c.id,'revenue').length}</strong></div><div className="summaryitem"><span>Modelo</span><strong style={{fontSize:16}}>{modeName(c.revenueMode)}</strong></div><div className="summaryitem"><span>Status</span><strong style={{fontSize:16}}>{statusFor(c.id)[0]}</strong></div></div>;
    return <div className="summary"><div className="summaryitem"><span>Receitas</span><strong>{revNoMove?'Sem movimento':money(t.rev)}</strong></div><div className="summaryitem"><span>Despesas</span><strong>{expNoMove?'Sem movimento':money(t.exp)}</strong></div><div className="summaryitem"><span>Saldo do período</span><strong className={t.balance>=0?'positive':'negative'}>{money(t.balance)}</strong></div><div className="summaryitem"><span>Status</span><strong style={{fontSize:16}}>{statusFor(c.id)[0]}</strong></div></div>;
  }

  function Readiness({c}){
    const submission=submissionFor(c.id),closing=closingFor(c.id),revCount=entriesFor(c.id,'revenue').length,expCount=entriesFor(c.id,'expense').length;
    const items=[
      {done:revCount>0||submission?.revenueNoMovement,title:'Receitas',text:revCount?`${revCount} registro(s) informado(s)`:submission?.revenueNoMovement?'Declarado sem movimento':'Ainda não informado'},
      ...(c.expenseEnabled?[{done:expCount>0||submission?.expenseNoMovement,title:'Despesas',text:expCount?`${expCount} registro(s) informado(s)`:submission?.expenseNoMovement?'Declarado sem movimento':'Ainda não informado'}]:[]),
      {done:!!submission,title:'Confirmação do cliente',text:submission?'Envio concluído':'Aguardando confirmação'},
      {done:!!closing?.closed,title:'Fechamento',text:closing?.closed?'Competência concluída':closing?'Análise em andamento':'Ainda não fechado'}
    ];
    return <div className={styles.checklist}>{items.map((item,i)=><div className={styles.checkRow} key={i}><div className={`${styles.checkDot} ${item.done?styles.done:styles.wait}`}><Icon name={item.done?'check':'alert'}/></div><div className={styles.checkText}><strong>{item.title}</strong><span>{item.text}</span></div></div>)}</div>;
  }

  function Overview({c}){
    const t=totals(c.id),p=totals(c.id,previousMonth(state.month));const revVar=p.rev?(t.rev-p.rev)/p.rev*100:null;const expVar=p.exp?(t.exp-p.exp)/p.exp*100:null;
    return <><Summary c={c}/><div className={styles.flowGrid}><section className="panel"><div className="panelhead"><div><h3>Situação da competência</h3><p>O que já foi informado e o que ainda falta.</p></div></div><div className="panelbody"><Readiness c={c}/></div></section><section className="panel"><div className="panelhead"><div><h3>Dados objetivos</h3><p>Sem interpretação automática.</p></div></div><div className="panelbody"><div className={styles.objectiveGrid}><div className={styles.objectiveCard}><span>Receitas x mês anterior</span><strong>{revVar===null?'Sem base':`${revVar>=0?'+':''}${percent(revVar)}`}</strong><small>{money(t.rev)} nesta competência</small></div>{c.expenseEnabled&&<div className={styles.objectiveCard}><span>Despesas x mês anterior</span><strong>{expVar===null?'Sem base':`${expVar>=0?'+':''}${percent(expVar)}`}</strong><small>{money(t.exp)} nesta competência</small></div>}<div className={styles.objectiveCard}><span>Registros</span><strong>{entriesFor(c.id,null).length}</strong><small>Total informado no mês</small></div>{c.expenseEnabled&&<div className={styles.objectiveCard}><span>Despesas / receitas</span><strong>{t.rev?percent(t.expenseRatio):'—'}</strong><small>Indicador financeiro, não lucro contábil</small></div>}</div></div></section></div></>;
  }

  function Entries({c,type}){
    const revenue=type==='revenue',mode=revenue?c.revenueMode:c.expenseMode,list=[...entriesFor(c.id,type)].sort((a,b)=>(String(b.date)||'').localeCompare(String(a.date)||'')),total=list.reduce((s,e)=>s+Number(e.amount||0),0),locked=isLocked(c.id),closed=isClosed(c.id),submission=submissionFor(c.id),noMovement=revenue?submission?.revenueNoMovement:submission?.expenseNoMovement;
    const buttonText=mode==='monthly'?(revenue?'Informar mês':'Informar total'):mode==='daily'?'Informar dia':mode==='category'?'Informar categoria':revenue?'Nova receita':'Nova despesa';
    return <>{locked&&<div className="lockbar"><div><Icon name="lock"/></div><div style={{flex:1}}><strong>{closed?'Competência fechada':'Envio concluído'}</strong><p>{closed?'Os lançamentos estão bloqueados. Reabra a competência para alterar.':'Os dados foram confirmados pelo cliente e estão bloqueados.'}</p></div></div>}<div className="pagehead"><div><h1 style={{fontSize:21}}>{revenue?'Receitas':'Despesas'}</h1><p>{modeName(mode)} • {monthName(state.month)}</p></div>{!locked&&<button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:type})}><Icon name="plus"/>{buttonText}</button>}</div><section className="panel"><div className="panelhead"><div><h3>{noMovement&&!list.length?'Sem movimento':`Total: ${money(total)}`}</h3><p>{list.length} registro(s) nesta competência</p></div><div className={styles.statusStrip}><span className="badge">{modeName(mode)}</span>{noMovement&&<span className={`${styles.movementBadge} ${styles.good}`}><Icon name="check"/>Sem movimento declarado</span>}</div></div>{list.length?<div className="tablewrap"><table><thead><tr><th>{mode==='category'?'Categoria':'Data'}</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th/></tr></thead><tbody>{list.map(entry=><tr key={entry.id}><td>{mode==='category'?entry.category:formatDate(entry.date)}</td><td>{entry.description}</td><td>{entry.category}</td><td><b>{money(entry.amount)}</b></td><td><div className={styles.tableActions}>{!locked&&<><button className="iconbtn" title="Editar" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:type,entry})}><Icon name="edit"/></button><button className="iconbtn dangertext" title="Excluir" onClick={()=>deleteEntry(entry)}><Icon name="trash"/></button></>}</div></td></tr>)}</tbody></table></div>:<div className={styles.emptyHero}><div className={styles.emptyIcon}><Icon name={revenue?'money':'file'}/></div><h2>{noMovement?'Sem movimento nesta competência':'Nenhum dado informado'}</h2><p>{noMovement?'O cliente confirmou que não houve movimentação neste módulo.':'Adicione o primeiro registro ou, na área do cliente, confirme a competência como sem movimento.'}</p>{!locked&&<button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:type})}>Adicionar agora</button>}</div>}</section></>;
  }

  function Closing({c}){
    const closing=closingFor(c.id)||{},submitted=!!submissionFor(c.id),closed=isClosed(c.id),status=statusFor(c.id)[2],idx=({waiting:0,filling:0,ready:1,analysis:2,closed:3})[status]??0;
    const steps=[['Dados do cliente','Receitas e despesas conforme o modelo.'],['Envio confirmado','Cliente concluiu a competência.'],['Análise','Sua leitura e recomendações.'],['Fechamento concluído','Mês bloqueado e consolidado.']];
    return <><Summary c={c}/>{!submitted&&!closed&&<div className="lockbar"><div><Icon name="alert"/></div><div style={{flex:1}}><strong>Aguardando o cliente</strong><p>O fechamento só deve avançar depois da confirmação da competência.</p></div><button className="btn btn-secondary" onClick={()=>previewClient(c.id)}><Icon name="eye"/>Ver como cliente</button></div>}<div className={styles.flowGrid}><section className="panel"><div className="panelhead"><div><h3>Análise do mês</h3><p>Registre sua leitura depois que o cliente concluir o envio.</p></div></div><form className="panelbody" onSubmit={e=>submitClosing(e,c.id)}><div className="field"><label>O que aconteceu neste mês?</label><textarea name="analysis" className="textarea" defaultValue={closing.analysis||''} disabled={!submitted&&!closed}/></div><div className="field"><label>Pontos de atenção</label><textarea name="attention" className="textarea" defaultValue={closing.attention||''} disabled={!submitted&&!closed}/></div><div className="field"><label>Recomendação</label><textarea name="recommendation" className="textarea" defaultValue={closing.recommendation||''} disabled={!submitted&&!closed}/></div><div className="actions" style={{justifyContent:'flex-end'}}>{closed?<button type="button" className="btn btn-secondary" onClick={()=>reopenClosing(c.id)}>Reabrir competência</button>:<><button className="btn btn-secondary" name="intent" value="draft" disabled={!submitted}>Salvar rascunho</button><button className="btn btn-primary" name="intent" value="close" disabled={!submitted}><Icon name="lock"/>Fechar mês</button></>}</div></form></section><section className="panel"><div className="panelhead"><div><h3>Etapas</h3><p>Status desta competência</p></div></div><div className="panelbody"><div className="steps">{steps.map((x,i)=><div className="step" key={x[0]}><div className={`stepdot ${i<idx?'done':i===idx?'current':''}`}>{i<idx?'✓':i+1}</div><div><strong>{x[0]}</strong><p>{x[1]}</p></div></div>)}</div>{submitted&&!closed&&<button className="btn btn-ghost btn-block" onClick={()=>reopenSubmission(c.id)}>Reabrir envio do cliente</button>}</div></section></div></>;
  }

  function Config({c}){
    const categorySection=type=>{const revenue=type==='revenue',base=revenue?DEFAULT_REVENUE_CATEGORIES:DEFAULT_EXPENSE_CATEGORIES,custom=revenue?(c.customRevenueCategories||[]):(c.customExpenseCategories||[]);return <div className="categorybox"><h4>Categorias de {revenue?'receitas':'despesas'}</h4><p>Use as categorias padrão e acrescente somente o que fizer sentido para este cliente.</p><div className="categorylist">{base.map(x=><span className="categorytag" key={x}>{x}</span>)}{custom.map(x=><span className="categorytag custom" key={x}>{x}<button onClick={()=>removeCategory(c.id,type,x)}>×</button></span>)}</div><form className="inlineadd" onSubmit={e=>addCategory(e,c.id,type)}><input name="category" className="input" placeholder="Nova categoria"/><button className="btn btn-secondary">Adicionar</button></form></div>};
    return <div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Como este cliente será acompanhado</h3><p>Ative somente o nível de controle que ele realmente vai manter.</p></div></div><div className="panelbody"><div className="setting"><div><h4>Receitas</h4><p>Escolha como o cliente vai informar as entradas.</p></div><div className="settingactions"><select className="select mode" value={c.revenueMode} onChange={e=>changeSetting(c.id,'revenueMode',e.target.value)}><option value="monthly">Resumo mensal</option><option value="daily">Resumo diário</option><option value="individual">Venda por venda</option></select><span className="badge">Ativo</span></div></div><div className="setting"><div><h4>Despesas</h4><p>Ative apenas quando fizer parte do acompanhamento contratado.</p></div><div className="settingactions"><select className="select mode" value={c.expenseMode} disabled={!c.expenseEnabled} onChange={e=>changeSetting(c.id,'expenseMode',e.target.value)}><option value="monthly">Total mensal</option><option value="category">Por categoria</option><option value="individual">Lançamento individual</option></select><button className={`switch ${c.expenseEnabled?'on':''}`} onClick={()=>changeSetting(c.id,'expenseEnabled',!c.expenseEnabled)}/></div></div>{categorySection('revenue')}{c.expenseEnabled&&categorySection('expense')}</div></section><section className="panel span5"><div className="panelhead"><div><h3>Dados do cliente</h3><p>Informações básicas e contato principal.</p></div></div><form className="panelbody" onSubmit={e=>saveCompanyMetadata(e,c)}><div className="field"><label>Documento</label><input name="document" className="input" defaultValue={c.document==='Não informado'?'':c.document}/></div><div className="field"><label>E-mail principal</label><input name="contact" type="email" className="input" defaultValue={c.contact||''}/></div><button className="btn btn-primary btn-block">Salvar dados</button><button type="button" className="btn btn-secondary btn-block" onClick={()=>previewClient(c.id)} style={{marginTop:8}}><Icon name="eye"/>Visualizar área do cliente</button></form></section></div>;
  }

  function Workspace({c}){const status=statusFor(c.id),tabs=[['overview','Visão geral'],['revenue','Receitas']];if(c.expenseEnabled)tabs.push(['expense','Despesas']);tabs.push(['closing','Fechamento'],['config','Configuração']);let body=<Overview c={c}/>;if(state.tab==='revenue')body=<Entries c={c} type="revenue"/>;if(state.tab==='expense')body=<Entries c={c} type="expense"/>;if(state.tab==='closing')body=<Closing c={c}/>;if(state.tab==='config')body=<Config c={c}/>;return <><button className="btn btn-ghost" style={{paddingLeft:0,marginBottom:8}} onClick={()=>mutate(s=>{s.selectedCompany=null})}><Icon name="back"/>Voltar</button><div className="companyhero"><div className="companytitle"><div className="avatar">{initials(c.name)}</div><div><h2>{c.name}</h2><p>{c.document} • {c.contact||'Sem e-mail principal'}</p></div></div><div className="herometa"><div><span>Modelo</span><strong>{c.expenseEnabled?'Receitas + despesas':'Somente receitas'}</strong></div><div><span>Status</span><strong>{status[0]}</strong></div><button className="btn btn-secondary" onClick={()=>previewClient(c.id)}><Icon name="eye"/>Ver como cliente</button></div></div><div className="tabs">{tabs.map(([key,label])=><button className={`tab ${state.tab===key?'active':''}`} key={key} onClick={()=>setTab(key)}>{label}</button>)}</div>{body}</>}

  function ClientHome({c}){
    const submission=submissionFor(c.id),closed=isClosed(c.id),locked=isLocked(c.id);const revCount=entriesFor(c.id,'revenue').length,expCount=entriesFor(c.id,'expense').length;
    return <><div className="pagehead"><div><h1>Olá, {c.name.split(' ')[0]}</h1><p>Competência de {monthName(state.month).toLowerCase()}.</p></div>{!locked&&<div className="actions"><button className="btn btn-primary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:'revenue'})}><Icon name="plus"/>Informar receita</button>{c.expenseEnabled&&<button className="btn btn-secondary" onClick={()=>setModal({type:'entry',companyId:c.id,entryType:'expense'})}>Informar despesa</button>}</div>}</div><Summary c={c}/><div className={styles.clientFocus}><section className="panel"><div className="panelhead"><div><h3>O que falta neste mês</h3><p>Confira antes de concluir o envio.</p></div></div><div className="panelbody"><Readiness c={c}/></div></section><section className="panel"><div className="panelhead"><div><h3>Concluir competência</h3><p>Você pode informar movimento ou declarar que não houve.</p></div></div><div className="panelbody">{closed?<div className="signal"><div className="signalicon good"><Icon name="lock"/></div><div><strong>Mês concluído</strong><p>Esta competência já foi fechada pelo contador.</p></div></div>:submission?<><div className="signal"><div className="signalicon good"><Icon name="check"/></div><div><strong>Dados enviados</strong><p>O contador já pode analisar esta competência.</p></div></div><p className={styles.dangerNote}>Se precisar corrigir algo, solicite a reabertura.</p></>:<><div className={styles.confirmIntro}><strong>Antes de confirmar</strong><p>{!revCount?'Receitas ainda não foram informadas. Você poderá marcar “sem movimento” na confirmação.':''}{c.expenseEnabled&&!expCount?' Despesas ainda não foram informadas. Também é possível declarar “sem movimento”.':''}</p></div><button className="btn btn-primary btn-block" onClick={()=>setModal({type:'confirm',companyId:c.id,noRevenue:false,noExpense:false})}><Icon name="check"/>Revisar e confirmar mês</button></>}</div></section></div></>;
  }

  function ClientFollowup({c}){const closing=closingFor(c.id);return <><div className="pagehead"><div><h1>Acompanhamento</h1><p>Orientações liberadas pelo seu contador.</p></div></div><section className="panel"><div className="panelbody">{closing?.closed?<><div className="field"><label>Leitura do mês</label><div className="notice" style={{margin:0,color:'var(--text)',background:'#FAFBFD',borderColor:'var(--border)'}}>{closing.analysis||'Sem análise registrada.'}</div></div><div className="field"><label>Pontos de atenção</label><div className="notice" style={{margin:0,color:'var(--text)',background:'#FAFBFD',borderColor:'var(--border)'}}>{closing.attention||'Sem pontos registrados.'}</div></div><div className="field"><label>Recomendação</label><div className="notice" style={{margin:0,color:'var(--text)',background:'#FAFBFD',borderColor:'var(--border)'}}>{closing.recommendation||'Sem recomendação registrada.'}</div></div></>:<div className={styles.emptyHero}><div className={styles.emptyIcon}><Icon name="file"/></div><h2>Fechamento em andamento</h2><p>Quando a análise for concluída, ela aparecerá aqui.</p></div>}</div></section></>}

  function ClientShell({c}){const tabs=[['overview','home','Início'],['revenue','money','Receitas']];if(c.expenseEnabled)tabs.push(['expense','file','Despesas']);tabs.push(['closing','chart','Acompanhamento']);let body=<ClientHome c={c}/>;if(state.tab==='revenue')body=<Entries c={c} type="revenue"/>;if(state.tab==='expense')body=<Entries c={c} type="expense"/>;if(state.tab==='closing')body=<ClientFollowup c={c}/>;return <div className="shell client-shell"><aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Meu Financeiro</div><div className="navtitle">{c.name}</div>{tabs.map(([key,icon,label])=><button key={key} className={`navbtn ${state.tab===key?'active':''}`} onClick={()=>setTab(key)}><Icon name={icon}/>{label}</button>)}<div className="sidebottom"><div className="usercard"><div className="avatar">{initials(c.name)}</div><div><strong>{c.name}</strong><span>Área do cliente</span></div></div>{isMaster?<button className="navbtn" onClick={()=>mutate(s=>{s.role='master'})}><Icon name="back"/>Voltar ao Master</button>:<button className="navbtn" onClick={signOut}><Icon name="logout"/>Sair</button>}</div></aside><main className="main"><header className="topbar"><div className="crumb"><strong>{c.name}</strong></div><div className="topright">{monthControl}<div className="avatar">{initials(c.name)}</div></div></header><div className="content">{isMaster&&<div className="client-banner"><span><b>Prévia do cliente:</b> esta é a experiência simplificada que a empresa verá.</span><button className="btn btn-secondary" onClick={()=>mutate(s=>{s.role='master'})}>Sair da prévia</button></div>}{body}</div></main></div>}

  function Settings(){return <><div className="pagehead"><div><h1>Configurações</h1><p>Seu acesso e preferências gerais da Central Financeira.</p></div></div><div className="grid sectiongrid"><section className="panel span7"><div className="panelhead"><div><h3>Sua conta</h3><p>Identificação do usuário atual.</p></div></div><div className="panelbody"><div className={styles.accountLine}><div className="avatar">{initials(user.name||user.email)}</div><div><strong>{user.name||'Usuário'}</strong><div className={styles.topHint}>{user.email}</div></div></div><div className={styles.accountLine}><div className={styles.checkDot}><Icon name="brief"/></div><div><strong>{state.systemRole==='super_admin'?'Super Admin':'Cliente'}</strong><div className={styles.topHint}>{state.systemRole==='super_admin'?'Acesso à gestão da carteira e aos fechamentos.':'Acesso somente às empresas vinculadas.'}</div></div></div></div></section><section className="panel span5"><div className="panelhead"><div><h3>Versão atual</h3><p>Status de uso.</p></div></div><div className="panelbody"><div className="signal"><div className="signalicon info"><Icon name="alert"/></div><div><strong>Ambiente de validação</strong><p>Continue usando somente dados fictícios enquanto finalizamos os testes de segurança e fluxo.</p></div></div><button className="btn btn-secondary btn-block" onClick={()=>refresh(true)} disabled={busy}><Icon name="refresh"/>Atualizar dados</button></div></section></div></>}

  function CompanyWizard(){
    if(modal?.type!=='company')return null;
    const canNext1=companyDraft.name.trim().length>1;
    const expenseLabel=companyDraft.expenseEnabled?modeName(companyDraft.expenseMode):'Não acompanhar';
    return <div className="modalback"><div className="modal"><div className="modalhead"><div><h3>Novo cliente</h3><div className={styles.topHint}>Etapa {companyStep} de 4</div></div><button className="closex" onClick={()=>setModal(null)}>×</button></div><div className="modalbody"><div className={styles.wizardProgress}>{[1,2,3,4].map(n=><span key={n} className={`${styles.wizardStep} ${n<=companyStep?styles.active:''}`}/>)}</div>{companyStep===1&&<><div className="field"><label>Nome da empresa ou cliente</label><input className="input" value={companyDraft.name} onChange={e=>setCompanyDraft(d=>({...d,name:e.target.value}))} placeholder="Ex.: Studio Ana" autoFocus/></div><div className="formgrid"><div className="field"><label>CNPJ / CPF</label><input className="input" value={companyDraft.document} onChange={e=>setCompanyDraft(d=>({...d,document:e.target.value}))}/></div><div className="field"><label>E-mail principal</label><input className="input" type="email" value={companyDraft.contact} onChange={e=>setCompanyDraft(d=>({...d,contact:e.target.value}))}/></div></div></>}{companyStep===2&&<><div className="field"><label>Como ele vai informar as receitas?</label></div><div className={styles.choiceGrid}>{[{key:'monthly',title:'Resumo mensal',text:'Informa um total da competência. É o modelo mais simples.'},{key:'daily',title:'Resumo diário',text:'Informa o total de cada dia, sem detalhar venda por venda.'},{key:'individual',title:'Venda por venda',text:'Maior detalhe para quem realmente precisa acompanhar cada recebimento.'}].map(opt=><button type="button" key={opt.key} className={`${styles.choiceCard} ${companyDraft.revenueMode===opt.key?styles.active:''}`} onClick={()=>setCompanyDraft(d=>({...d,revenueMode:opt.key}))}><strong>{opt.title}</strong><span>{opt.text}</span></button>)}</div></>}{companyStep===3&&<><div className="setting"><div><h4>Acompanhar despesas?</h4><p>Ative somente se o cliente realmente vai manter esse controle.</p></div><div className="settingactions"><button type="button" className={`switch ${companyDraft.expenseEnabled?'on':''}`} onClick={()=>setCompanyDraft(d=>({...d,expenseEnabled:!d.expenseEnabled}))}/></div></div>{companyDraft.expenseEnabled&&<><div className="field" style={{marginTop:16}}><label>Como ele vai informar as despesas?</label></div><div className={styles.choiceGrid}>{[{key:'monthly',title:'Total mensal',text:'Um único valor de despesas no mês.'},{key:'category',title:'Por categoria',text:'Totais separados por aluguel, impostos, fornecedores e outras categorias.'},{key:'individual',title:'Despesa por despesa',text:'Maior detalhe para acompanhar cada saída.'}].map(opt=><button type="button" key={opt.key} className={`${styles.choiceCard} ${companyDraft.expenseMode===opt.key?styles.active:''}`} onClick={()=>setCompanyDraft(d=>({...d,expenseMode:opt.key}))}><strong>{opt.title}</strong><span>{opt.text}</span></button>)}</div></>}</>}{companyStep===4&&<><div className={styles.confirmIntro}><strong>Confira a configuração</strong><p>Você poderá alterar o nível de controle depois.</p></div><div className={styles.reviewBox}><div className={styles.reviewRow}><span>Cliente</span><strong>{companyDraft.name||'—'}</strong></div><div className={styles.reviewRow}><span>Receitas</span><strong>{modeName(companyDraft.revenueMode)}</strong></div><div className={styles.reviewRow}><span>Despesas</span><strong>{expenseLabel}</strong></div><div className={styles.reviewRow}><span>Contato</span><strong>{companyDraft.contact||'Não informado'}</strong></div></div></>}</div><div className="modalfoot">{companyStep>1?<button type="button" className="btn btn-secondary" onClick={()=>setCompanyStep(s=>s-1)}>Voltar</button>:<button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>}{companyStep<4?<button type="button" className="btn btn-primary" disabled={companyStep===1&&!canNext1} onClick={()=>setCompanyStep(s=>s+1)}>Continuar <Icon name="arrow"/></button>:<button type="button" className="btn btn-primary" disabled={busy} onClick={createCompanyFromWizard}>{busy?'Criando…':'Criar cliente'}</button>}</div></div></div>;
  }

  function EntryModal(){
    if(modal?.type!=='entry')return null;
    const c=company(modal.companyId),revenue=modal.entryType==='revenue',mode=revenue?c.revenueMode:c.expenseMode,monthly=mode==='monthly',daily=mode==='daily',categoryMode=mode==='category',cats=categoriesFor(c,modal.entryType),entry=modal.entry,defaultDate=entry?.date?String(entry.date).slice(0,10):`${state.month}-${String(Math.min(new Date().getDate(),28)).padStart(2,'0')}`;
    return <div className="modalback"><div className="modal"><div className="modalhead"><h3>{entry?'Editar':'Informar'} {revenue?'receita':'despesa'}</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><form onSubmit={submitEntry}><div className="modalbody"><div className="formgrid">{!monthly&&!categoryMode&&<div className="field"><label>Data</label><input name="date" type="date" className="input" defaultValue={defaultDate} required/></div>}<div className={`field ${monthly||categoryMode?'full':''}`}><label>Valor</label><input name="amount" type="number" min="0" step="0.01" className="input" defaultValue={entry?.amount??''} required/></div>{categoryMode?<div className="field full"><label>Categoria</label><select name="category" className="select" defaultValue={entry?.category||cats[0]}>{cats.map(x=><option key={x}>{x}</option>)}</select></div>:mode==='individual'?<><div className="field full"><label>Descrição</label><input name="description" className="input" defaultValue={entry?.description||''} required/></div><div className="field full"><label>Categoria</label><select name="category" className="select" defaultValue={entry?.category||cats[0]}>{cats.map(x=><option key={x}>{x}</option>)}</select></div></>:daily?<div className="field full"><label>Descrição</label><input name="description" className="input" defaultValue={entry?.description||'Total do dia'}/></div>:null}</div></div><div className="modalfoot"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{entry?'Salvar alteração':'Salvar'}</button></div></form></div></div>;
  }

  function ConfirmModal(){
    if(modal?.type!=='confirm')return null;
    const c=company(modal.companyId);const revCount=entriesFor(c.id,'revenue').length;const expCount=entriesFor(c.id,'expense').length;const revenueReady=revCount>0||modal.noRevenue;const expenseReady=!c.expenseEnabled||expCount>0||modal.noExpense;const canConfirm=revenueReady&&expenseReady;
    async function confirmNow(){if(!canConfirm)return;await run(()=>confirmMonth({organizationId:c.id,month:state.month,revenueNoMovement:!revCount&&modal.noRevenue,expenseNoMovement:c.expenseEnabled&&!expCount&&modal.noExpense,settingsSnapshot:{revenueMode:c.revenueMode,expenseEnabled:c.expenseEnabled,expenseMode:c.expenseMode}}),'Dados confirmados e enviados');setModal(null)}
    return <div className="modalback"><div className="modal"><div className="modalhead"><h3>Confirmar {monthName(state.month)}</h3><button className="closex" onClick={()=>setModal(null)}>×</button></div><div className="modalbody"><div className={styles.confirmIntro}><strong>Confirme somente depois de conferir os dados</strong><p>Após o envio, os lançamentos ficam bloqueados até o contador reabrir a competência.</p></div><div className={styles.reviewBox}><div className={styles.reviewRow}><span>Receitas</span><strong>{revCount?`${revCount} registro(s) • ${money(totals(c.id).rev)}`:'Nenhum registro'}</strong></div>{c.expenseEnabled&&<div className={styles.reviewRow}><span>Despesas</span><strong>{expCount?`${expCount} registro(s) • ${money(totals(c.id).exp)}`:'Nenhum registro'}</strong></div>}</div>{!revCount&&<label className={styles.movementOption}><input type="checkbox" checked={!!modal.noRevenue} onChange={e=>setModal(m=>({...m,noRevenue:e.target.checked}))}/><div><strong>Não tive receitas neste mês</strong><span>Marque somente se realmente não houve movimento de receitas.</span></div></label>}{c.expenseEnabled&&!expCount&&<label className={styles.movementOption}><input type="checkbox" checked={!!modal.noExpense} onChange={e=>setModal(m=>({...m,noExpense:e.target.checked}))}/><div><strong>Não tive despesas neste mês</strong><span>Marque somente se realmente não houve despesas a informar.</span></div></label>}<p className={styles.dangerNote}>Se existir movimentação, volte e faça o lançamento antes de confirmar.</p></div><div className="modalfoot"><button type="button" className="btn btn-secondary" onClick={()=>setModal(null)}>Voltar</button><button type="button" className="btn btn-primary" disabled={!canConfirm||busy} onClick={confirmNow}><Icon name="check"/>{busy?'Enviando…':'Confirmar competência'}</button></div></div></div>;
  }

  function Modal(){return <><CompanyWizard/><EntryModal/><ConfirmModal/></>}

  if(state.role!=='master'&&currentCompany)return <><ClientShell c={currentCompany}/><Modal/>{toast&&<div className="toast">{toast}</div>}</>;

  const navButton=(view,icon,label)=><button className={`navbtn ${state.view===view&&!state.selectedCompany?'active':''}`} onClick={()=>setView(view)}><Icon name={icon}/>{label}</button>;
  const sidebar=<aside className="sidebar"><div className="brand"><div className="brandmark">LG</div>Central Financeira</div><div className="navtitle">Gestão</div>{navButton('dashboard','home','Visão geral')}{navButton('companies','users','Clientes')}{navButton('closings','check','Fechamentos')}<div className="navtitle">Sistema</div>{navButton('settings','settings','Configurações')}<div className="sidebottom"><div className="usercard"><div className="avatar">{initials(user.name||'LG')}</div><div><strong>{user.name||user.email}</strong><span>Super Admin</span></div></div><button className="navbtn" onClick={signOut} disabled={busy}><Icon name="logout"/>Sair</button></div></aside>;

  let content=<Dashboard/>;if(state.view==='companies')content=<Companies/>;if(state.view==='closings')content=<Closings/>;if(state.view==='settings')content=<Settings/>;if(currentCompany)content=<Workspace c={currentCompany}/>;
  const titleView=({dashboard:'Visão geral',companies:'Clientes',closings:'Fechamentos',settings:'Configurações'})[state.view]||'Visão geral';
  return <><div className="shell">{sidebar}<main className="main"><header className="topbar"><div className="crumb">Central Financeira <span>›</span><strong>{currentCompany?currentCompany.name:titleView}</strong></div><div className="topright">{monthControl}<div className="avatar">{initials(user.name||'LG')}</div></div></header><div className="content">{error&&<div className="notice" style={{marginBottom:14,color:'var(--danger)',borderColor:'#F2C9C5'}}>{error}</div>}{content}</div></main></div><Modal/>{toast&&<div className="toast">{toast}</div>}</>;
}
