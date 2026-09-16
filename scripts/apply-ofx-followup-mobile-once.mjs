import fs from 'node:fs';

function replaceOnce(path, before, after, label) {
  const text = fs.readFileSync(path, 'utf8');
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: ${label}: expected one match, found ${count}`);
  fs.writeFileSync(path, text.replace(before, after));
}
function appendOnce(path, css, guard) {
  const text = fs.readFileSync(path, 'utf8');
  if (text.includes(guard)) throw new Error(`${path}: mobile patch already applied`);
  fs.writeFileSync(path, `${text.trimEnd()}\n\n${css.trim()}\n`);
}

const center = 'components/ImportCenter.jsx';
replaceOnce(center,
  "  const [tab, setTab] = useState('spreadsheets');",
  "  const [tab, setTab] = useState('spreadsheets');\n  const [postingAutoOpen, setPostingAutoOpen] = useState(false);",
  'posting navigation state');
replaceOnce(center,
  "onClick={() => { setTab(value); setError(''); setNotice(''); }}",
  "onClick={() => { setPostingAutoOpen(false); setTab(value); setError(''); setNotice(''); }}",
  'manual navigation reset');
replaceOnce(center,
  '<div className={styles.ofxTool}><OfxImportLauncher/></div>',
  "<div className={styles.ofxTool}><OfxImportLauncher preferredOrganizationId={organizationId} onReviewImported={importedOrganizationId => { setOrganizationId(importedOrganizationId); setPostingAutoOpen(true); setTab('posting'); setError(''); setNotice(''); }}/></div>",
  'OFX import review action');
replaceOnce(center,
  '<div className={styles.ofxTool}><OfxEntryPostingLauncher/></div>',
  '<div className={styles.ofxTool}><OfxEntryPostingLauncher autoOpen={postingAutoOpen} preferredOrganizationId={organizationId}/></div>',
  'OFX posting automatic opening');

const importer = 'components/OfxImportLauncher.jsx';
replaceOnce(importer,
  'export default function OfxImportLauncher() {',
  'export default function OfxImportLauncher({ preferredOrganizationId = \'\', onReviewImported } = {}) {',
  'importer callback props');
replaceOnce(importer,
  "  const [organizationId, setOrganizationId] = useState('');",
  "  const [organizationId, setOrganizationId] = useState(preferredOrganizationId);",
  'importer company choice');
replaceOnce(importer,
  "  const [notice, setNotice] = useState('');",
  "  const [notice, setNotice] = useState('');\n  const [reviewReady, setReviewReady] = useState(false);",
  'success review state');
replaceOnce(importer,
  "setFilter('all'); setNotice(''); setError('');",
  "setFilter('all'); setNotice(''); setError(''); setReviewReady(false);",
  'reset review on company change');
replaceOnce(importer,
  "setBusy(true); setError(''); setNotice(''); setParsed(null); setDuplicates([]); setSelected([]);",
  "setBusy(true); setError(''); setNotice(''); setReviewReady(false); setParsed(null); setDuplicates([]); setSelected([]);",
  'reset review on choosing new file');
replaceOnce(importer,
  "    setBusy(true); setError(''); setNotice('');\n    try {\n      const rows = parsed.rows.filter",
  "    setBusy(true); setError(''); setNotice(''); setReviewReady(false);\n    try {\n      const rows = parsed.rows.filter",
  'reset review on confirm');
replaceOnce(importer,
  "      setNotice(`${Number(result.imported || 0)} movimentação(ões) guardada(s) para conferência. ${Number(result.duplicates || 0)} duplicada(s) ignorada(s). Nenhum saldo ou lançamento foi alterado.`);",
  "      setNotice(`${Number(result.imported || 0)} movimentação(ões) guardada(s) para conferência. ${Number(result.duplicates || 0)} duplicada(s) ignorada(s). Nenhum saldo ou lançamento foi alterado.`);\n      setReviewReady(Number(result.imported || 0) > 0);",
  'show review after successful import only');
replaceOnce(importer,
  "          {notice && <p role=\"status\" className={styles.success}>{notice}</p>}",
  "          {notice && <p role=\"status\" className={styles.success}>{notice}</p>}\n          {reviewReady && <div className={styles.nextActions} aria-label=\"Próxima etapa do extrato\"><button type=\"button\" className={styles.reviewAction} onClick={() => { setOpen(false); setReviewReady(false); onReviewImported?.(organizationId); }}>Revisar e lançar movimentações</button><button type=\"button\" className={styles.laterAction} onClick={() => { setOpen(false); setReviewReady(false); }}>Fazer isso depois</button></div>}",
  'post-import optional review actions');

const posting = 'components/OfxEntryPostingLauncher.jsx';
replaceOnce(posting,
  'export default function OfxEntryPostingLauncher() {',
  "export default function OfxEntryPostingLauncher({ autoOpen = false, preferredOrganizationId = '' } = {}) {",
  'posting props');
replaceOnce(posting,
  '  const [open, setOpen] = useState(false);',
  '  const [open, setOpen] = useState(Boolean(autoOpen));',
  'posting auto-open');
replaceOnce(posting,
  "  const [organizationId, setOrganizationId] = useState('');",
  '  const [organizationId, setOrganizationId] = useState(preferredOrganizationId);',
  'posting same company');

appendOnce('components/ImportCenter.module.css', `/* Mobile import center: no sideways navigation or undersized tap targets. */
@media(max-width:720px){
  .page{padding:18px 12px calc(42px + env(safe-area-inset-bottom));overflow-x:clip}
  .container{gap:14px;min-width:0}
  .header{gap:10px}.header h1{font-size:27px}.header p{line-height:1.5}
  .mark{width:38px;height:38px;border-radius:11px}
  .back{margin-bottom:15px;min-height:44px;align-items:center}
  .toolbar{min-width:0;padding:15px}
  .toolbar select,.controls select,.controls input{min-height:48px;font-size:16px}
  .tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;overflow:visible}
  .tabs button{min-width:0;min-height:52px;padding:10px 7px;white-space:normal;line-height:1.3;text-align:center;font-size:12px}
  .panel{padding:15px;gap:17px;border-radius:15px}
  .ofxTool :global(button[class*="launcher"]){min-height:50px;font-size:14px}
  .historyRow{padding:13px;overflow-wrap:anywhere}
}
@media(max-width:370px){.mark{display:none}.tabs button{font-size:11px}}`, 'Mobile import center:');

appendOnce('components/OfxImportLauncher.module.css', `/* Mobile-first OFX review: each bank movement is a readable selectable card. */
.nextActions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.reviewAction,.laterAction{min-height:48px;padding:11px 16px;border-radius:10px;border:1px solid #2456E8;font:700 13px Inter,system-ui,sans-serif;cursor:pointer}
.reviewAction{background:#2456E8;color:#fff}.laterAction{background:#fff;color:#2456E8}
.nextActions :is(button):focus-visible{outline:3px solid #89A8FF;outline-offset:2px}
@media(max-width:620px){
 .overlay{overflow:hidden}
 .dialog{display:flex;flex-direction:column;max-height:100dvh;height:100dvh;overflow:hidden}
 .heading{flex:0 0 auto;padding:16px;gap:9px}.heading>div{min-width:0}.heading h2{font-size:20px}.close{width:44px;height:44px;flex:0 0 44px}
 .body{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:15px 14px calc(15px + env(safe-area-inset-bottom))}
 .fields select,.controls select{height:48px;font-size:16px}
 .upload{padding:19px 12px}.upload input{font-size:16px;width:100%}
 .controls{align-items:stretch}.controls label{min-height:44px;flex:1 1 100%}.controls input{width:22px;height:22px}.controls select{width:100%}
 .summary{grid-template-columns:repeat(2,minmax(0,1fr))}
 .tableScroll{max-height:none;overflow:visible;border:0;border-radius:0}
 .tableScroll table,.tableScroll tbody{display:block;width:100%;min-width:0}
 .tableScroll thead{display:none}
 .tableScroll tr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px 10px;padding:14px;margin-bottom:10px;border:1px solid #E4E9F1;border-radius:12px;background:#fff}
 .tableScroll td{display:block;border:0;padding:0;font-size:13px;min-width:0;overflow-wrap:anywhere}
 .tableScroll td:first-child{grid-column:1/-1;display:flex;align-items:center;gap:9px;font-weight:700}
 .tableScroll td:first-child::after{content:'Selecionar movimentação';font-size:12px;color:#475467}
 .tableScroll td:first-child input{width:22px;height:22px;flex:0 0 22px}
 .tableScroll td:nth-child(2){grid-column:1/-1;color:#667085;font-size:12px}
 .tableScroll td:nth-child(3){grid-column:1/-1;font-size:14px;font-weight:650;line-height:1.5}
 .tableScroll td:nth-child(4){grid-column:1;white-space:normal;text-align:left;font-size:14px}
 .tableScroll td:nth-child(5){grid-column:2;text-align:right;font-size:12px;color:#667085}
 .footer{position:sticky;bottom:0;z-index:2;padding:12px 0 calc(8px + env(safe-area-inset-bottom));background:#fff;box-shadow:0 -10px 18px #fff}
 .confirm{min-height:50px;font-size:14px}
 .nextActions{display:grid;grid-template-columns:1fr}.nextActions button{width:100%;min-height:50px;font-size:14px}
 .history>div{display:grid;gap:4px}.history strong{white-space:normal}
}
@media(max-width:360px){.summary{grid-template-columns:1fr}.summary>div:first-child{grid-column:auto}}`, 'Mobile-first OFX review:');

appendOnce('components/OfxEntryPostingLauncher.module.css', `/* Single scroll surface and thumb-sized controls for bank posting on phones. */
@media(max-width:620px){
 .overlay{overflow:hidden}
 .dialog{display:flex;flex-direction:column;width:100%;height:100dvh;max-height:100dvh;overflow:hidden}
 .header{flex:0 0 auto;gap:9px}.header>div{min-width:0}.close{width:44px;height:44px;flex:0 0 44px}
 .body{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:15px 14px calc(15px + env(safe-area-inset-bottom))}
 .toolbar select,.itemFields select,.itemFields input{min-height:48px;height:48px;font-size:16px}
 .toolbar .checkbox{min-height:48px}.checkbox input,.ack input{width:22px;height:22px;flex:0 0 22px}
 .secondary,.primary{min-height:50px;font-size:14px}.secondary{width:100%}
 .items{max-height:none;overflow:visible;gap:11px}
 .item{padding:14px;gap:13px}.itemTop{display:grid;gap:8px}.itemTop strong{font-size:14px;line-height:1.4}
 .amount{justify-items:start;white-space:normal;font-size:16px}
 .itemFields{grid-template-columns:minmax(0,1fr);gap:12px}.itemFields label{font-size:13px}
 .footer{position:sticky;bottom:0;z-index:2;background:#fff;padding:14px 0 calc(9px + env(safe-area-inset-bottom));box-shadow:0 -10px 18px #fff}
 .totals{align-items:flex-start;display:grid}.totals span{line-height:1.4}
 .ack{font-size:13px;align-items:flex-start}.primary{width:100%}
}
`, 'Single scroll surface and thumb-sized');

console.log('OFX follow-up and mobile layout changes applied.');