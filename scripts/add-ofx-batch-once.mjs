import fs from 'node:fs';
let file = 'components/OfxEntryPostingLauncher.jsx';
let text = fs.readFileSync(file, 'utf8');
function change(before, after) { const pos = text.indexOf(before); if (pos < 0 || text.indexOf(before, pos + before.length) !== -1) throw new Error('Expected one OFX UI match'); text = text.slice(0, pos) + after + text.slice(pos + before.length); }
change("import { buildOfxPostingPayload, explainOfxPostingError } from '../lib/ofx-posting-payload.mjs';", "import { buildOfxPostingPayload, explainOfxPostingError } from '../lib/ofx-posting-payload.mjs';\nimport { prepareOfxBatch } from '../lib/ofx-batch-choices.mjs';");
change('  const [loading, setLoading] = useState(false);', '  const [loading, setLoading] = useState(false);\n  const [batchSummary, setBatchSummary] = useState(null);');
change('      setChoices({}); setAcknowledged(false);', '      setChoices({}); setAcknowledged(false); setBatchSummary(null);');
change('  async function postSelected() {', `  function prepareBatch() {
    if (!company || busy || loading) return;
    const batch = prepareOfxBatch(rows, company.tier);
    setChoices(batch.choices);
    setBatchSummary(batch);
    setPendingOnly(true);
    setAcknowledged(false);
    setError('');
    setNotice(batch.prepared ? 'Lote preparado para revisão. Nenhum lançamento foi criado ainda.' : 'Não há movimentos elegíveis para seleção rápida. Confira e classifique manualmente os que forem apropriados.');
  }

  async function postSelected() {`);
change('Converta movimentações já importadas em receitas ou despesas com confirmação individual.', 'Converta movimentações individualmente ou prepare um lote para confirmar de uma vez.');
change('          <div className={styles.items}>', `          <div className={styles.batchToolbar}>
            <div><strong>Preparar lançamentos em lote</strong><span>Até 100 movimentos por vez, inicialmente sem categoria. Confira os valores e retire transferências, empréstimos e valores já lançados antes de confirmar.</span></div>
            <button type="button" className={styles.secondary} disabled={busy || loading || !rows.some(item => !item.posted_at)} onClick={prepareBatch}>Preparar lote</button>
            <button type="button" className={styles.secondary} disabled={busy || loading || !selected.length} onClick={() => { setChoices({}); setAcknowledged(false); setBatchSummary(null); setNotice('Seleção limpa.'); }}>Limpar seleção</button>
          </div>
          {batchSummary && <p className={styles.hint} role="status">{batchSummary.prepared} preparado(s) · {batchSummary.flagged} item(ns) ambíguo(s) para revisão manual · {batchSummary.unsupported} incompatível(is) · {batchSummary.remaining} elegível(is) para próximo lote. As categorias podem ser definidas nos lançamentos depois.</p>}
          <div className={styles.items}>`);
change('Conferi que estes movimentos são receitas ou despesas e não foram lançados anteriormente.', 'Conferi o lote e retirei transferências, estornos, empréstimos e valores que já tinham lançamento manual.');
fs.writeFileSync(file, text);
fs.appendFileSync('components/OfxEntryPostingLauncher.module.css', '\n.batchToolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:14px;border:1px solid #cbd9ff;background:#f5f8ff;border-radius:12px}.batchToolbar>div{flex:1 1 270px;display:grid;gap:5px}.batchToolbar strong{font-size:13px}.batchToolbar span{font-size:12px;color:#475467;line-height:1.5}\n@media(max-width:620px){.batchToolbar{align-items:stretch}.batchToolbar>div{flex:1 1 100%}.batchToolbar .secondary{width:100%;min-height:48px;font-size:14px}}\n');
console.log('OFX batch UI integrated with explicit preparation and manual confirmation.');
