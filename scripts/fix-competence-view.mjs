import fs from 'node:fs';
function edit(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [before, after] of replacements) {
    const pos = text.indexOf(before);
    if (pos < 0 || text.indexOf(before, pos + before.length) >= 0) throw new Error('Could not find unique edit location: ' + path);
    text = text.slice(0, pos) + after + text.slice(pos + before.length);
  }
  fs.writeFileSync(path, text);
}
edit('components/BasicControlAppV1.jsx', [
  ['export default function BasicControlAppV1() {', 'export default function BasicControlAppV1({ embedded = false } = {}) {'],
  ["  const [view, setView] = useState('overview');", "  const [view, setView] = useState(embedded ? 'closing' : 'overview');"],
  ['  return <div className={styles.shell}>\n    <aside className={styles.sidebar}>', "  return <div className={styles.shell} style={embedded ? {minHeight:0,background:'transparent'} : undefined}>\n    {!embedded && <aside className={styles.sidebar}>"],
  ['    </aside>\n\n    <main className={styles.main}>', "    </aside>}\n\n    <main className={styles.main} style={embedded ? {marginLeft:0,minHeight:0,width:'100%'} : undefined}>"],
  ['      <header className={styles.topbar}>', '      {!embedded && <header className={styles.topbar}>'],
  ['</header>\n      <div className={styles.content}>', "</header>}\n      {embedded && <div className={styles.topbar} style={{position:'static',height:'auto',minHeight:66,padding:'12px 16px',marginBottom:14,borderRadius:12,flexWrap:'wrap'}}><div><strong>Competência mensal</strong><span>{company.name}</span></div><MonthPicker value={month} startMonth={startMonth} onChange={setMonth}/></div>}\n      <div className={styles.content} style={embedded ? {padding:0,maxWidth:'none'} : undefined}>"],
  ["          if (result) setView('overview');\n        }} onReopen", "          if (result) setView(embedded ? 'closing' : 'overview');\n        }} onReopen"],
  ["    <BasicMobileNav view={view} revenueDetailed={revenueMode === 'individual'} expenseDetailed={expenseMode === 'individual'} onNavigate={navigate}/>", "    {!embedded && <BasicMobileNav view={view} revenueDetailed={revenueMode === 'individual'} expenseDetailed={expenseMode === 'individual'} onNavigate={navigate}/>}"]
]);
edit('components/CompleteControlAppV36.jsx', [
  ["const TITLES={overview:", "const TITLES={competency:['Competência','Confira e conclua o mês sem sair do Controle Completo.'],overview:"],
  ["  if(view==='competency')return <div className={styles.competencyBridge}><BasicControlAppV1/><button className={styles.backFinance} onClick={()=>{setView('overview');refresh()}}><Icon name=\"back\"/>Voltar ao financeiro</button></div>;\n", ''],
  ["        {view==='overview'&&<Overview", "        {view==='competency'&&<div className={styles.competencyBridge} style={{minHeight:0}}><BasicControlAppV1 embedded /></div>}\n        {view==='overview'&&<Overview"]
]);
console.log('Competence layout updated in the existing Complete Control shell.');
