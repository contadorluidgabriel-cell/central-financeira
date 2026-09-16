import fs from 'node:fs';

const changes = [];
function edit(path, operations) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [before, after, label] of operations) {
    const matches = source.split(before).length - 1;
    if (matches !== 1) throw new Error(`${path}: expected one occurrence of ${label}, found ${matches}`);
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
  changes.push(`${path}: ${operations.map(([, , label]) => label).join(', ')}`);
}

edit('components/ImportCenter.jsx', [
  ["  const [history, setHistory] = useState([]);", "  const [history, setHistory] = useState([]);\n  const [historyRows, setHistoryRows] = useState([]);", 'separate OFX file and movement history'],
  ["const historyCounts = useMemo(() => history.reduce(", "const historyCounts = useMemo(() => historyRows.reduce(", 'count movements instead of files'],
  ["}, new Map()), [history]);", "}, new Map()), [historyRows]);", 'fix history count dependency'],
  ["function changeCompany(value) { setOrganizationId(value);", "function changeCompany(value) { setKind('revenue'); setOrganizationId(value);", 'reset import type on company change']
]);

edit('components/SimpleControlAppV2.jsx', [
  ["        <NavButton active={view === 'revenues'} icon=\"money\" label=\"Receitas\" onClick={() => navigate('revenues')}/>", "        <NavButton active={view === 'revenues'} icon=\"money\" label=\"Receitas\" onClick={() => navigate('revenues')}/>\n        <NavButton active={false} icon=\"download\" label=\"Importações\" onClick={() => window.location.assign('/importacoes')}/>", 'desktop import navigation'],
  ["<button className={styles.secondaryButtonSmall} onClick={onImport}><Icon name=\"download\"/>Importar Excel/CSV</button>", '', 'remove inline revenue import button'],
  ["<button onClick={() => { onNavigate('settings'); setMoreOpen(false); }}><Icon name=\"settings\"/>Configurações</button></div></div>", "<button onClick={() => { onNavigate('settings'); setMoreOpen(false); }}><Icon name=\"settings\"/>Configurações</button><button onClick={() => window.location.assign('/importacoes')}><Icon name=\"download\"/>Importações</button></div></div>", 'mobile import navigation']
]);

edit('components/BasicControlAppV1.jsx', [
  ["        <NavButton active={view === 'expenses'} icon=\"expense\" label=\"Despesas\" onClick={() => navigate('expenses')}/>", "        <NavButton active={view === 'expenses'} icon=\"expense\" label=\"Despesas\" onClick={() => navigate('expenses')}/>\n        <NavButton active={false} icon=\"download\" label=\"Importações\" onClick={() => window.location.assign('/importacoes')}/>", 'desktop import navigation'],
  ["<button className={styles.secondaryButtonSmall} onClick={onImport}><Icon name=\"download\"/>Importar</button>", '', 'remove inline revenue and expense import buttons'],
  ["    <button onClick={() => { onNavigate('settings'); setMoreOpen(false); }}><Icon name=\"settings\"/>Configurações</button>", "    <button onClick={() => { onNavigate('settings'); setMoreOpen(false); }}><Icon name=\"settings\"/>Configurações</button>\n    <button onClick={() => window.location.assign('/importacoes')}><Icon name=\"download\"/>Importações</button>", 'mobile import navigation']
]);

edit('components/CompleteControlAppV36.jsx', [
  ["{group:'Auditoria',items:[['history','Histórico','history']]}", "{group:'Auditoria',items:[['imports','Importações','statement'],['history','Histórico','history']]}", 'complete control navigation'],
  ["onClick={()=>{setView(key);setDetail(null);setModal(null)}}", "onClick={()=>{if(key==='imports'){window.location.assign('/importacoes');return}setView(key);setDetail(null);setModal(null)}}", 'open dedicated import module']
]);

console.log(changes.join('\n'));
