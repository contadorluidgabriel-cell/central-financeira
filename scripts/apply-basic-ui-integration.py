from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


simple_path = Path('components/SimpleControlAppV2.jsx')
simple = simple_path.read_text(encoding='utf-8')

simple = replace_once(
    simple,
    "import { generateSimpleRevenuePdf } from '../lib/simple-report-pdf';\n",
    "import { generateSimpleRevenuePdf } from '../lib/simple-report-pdf';\nimport { BASIC_EXPENSE_MODES, updateBasicSettings } from '../lib/neon-basic-control';\n",
    'basic imports'
)

old_call = '''  if (!company.controlStartMonth) {
    return <Onboarding company={company} busy={busy} onSave={async ({ mode, startMonth: initialMonth }) => {
      await run(async () => {
        await updateSimpleSettings(company.id, { revenueMode: mode, controlTier: 'simple', controlStartMonth: initialMonth });
        setMonth(initialMonth);
      }, 'Controle Simples configurado.');
    }} onLogout={signOut}/>;
  }
'''
new_call = '''  if (!company.controlStartMonth) {
    return <Onboarding company={company} busy={busy} onSave={async ({ tier, revenueMode, expenseMode, startMonth: initialMonth }) => {
      const result = await run(async () => {
        await updateBasicSettings(company.id, {
          controlTier: tier,
          controlStartMonth: initialMonth,
          revenueMode,
          expenseEnabled: tier === 'basic',
          expenseMode: tier === 'basic' ? expenseMode : 'monthly'
        });
        setMonth(initialMonth);
      }, tier === 'basic' ? 'Controle Básico configurado.' : 'Controle Simples configurado.');
      if (result !== null && tier === 'basic') window.location.reload();
    }} onLogout={signOut}/>;
  }
'''
simple = replace_once(simple, old_call, new_call, 'onboarding call')

new_onboarding = r'''function Onboarding({ company, busy, onSave, onLogout }) {
  const [tier, setTier] = useState('simple');
  const [revenueMode, setRevenueMode] = useState(company.revenueMode || 'monthly');
  const [expenseMode, setExpenseMode] = useState('monthly');
  const [startMonth, setStartMonth] = useState(monthKey());
  return <div className={styles.onboarding}><div className={styles.onboardingCard}>
    <div className={styles.onboardingTop}><div className={styles.brandMark}>LG</div><button onClick={onLogout}>Sair</button></div>
    <span className={styles.eyebrow}>Configuração da sua Central</span>
    <h1>Como você quer controlar sua empresa?</h1>
    <p>A escolha é sua. O contador acompanha a configuração, mas não escolhe o nível nem o modo por você. Você pode começar mais simples e evoluir depois.</p>

    <p><strong>1. Escolha o nível de controle</strong></p>
    <div className={styles.modeGrid}>
      <button type="button" className={`${styles.modeCard} ${tier === 'simple' ? styles.modeCardActive : ''}`} onClick={() => setTier('simple')}>
        <strong>Controle Simples</strong><span>Acompanha apenas faturamento. Ideal para quem quer começar sem registrar despesas.</span>
      </button>
      <button type="button" className={`${styles.modeCard} ${tier === 'basic' ? styles.modeCardActive : ''}`} onClick={() => setTier('basic')}>
        <strong>Controle Básico</strong><span>Acompanha faturamento, despesas e resultado gerencial, sem contas a pagar, receber ou caixa.</span>
      </button>
    </div>

    <p><strong>2. Como você prefere registrar seu faturamento?</strong> Mudanças futuras passam a valer no mês seguinte para preservar o histórico.</p>
    <div className={styles.modeGrid}>{SIMPLE_MODES.map(item => <button type="button" className={`${styles.modeCard} ${revenueMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setRevenueMode(item)}><strong>{modeName(item)}</strong><span>{item === 'monthly' ? 'Informe apenas quanto faturou no mês.' : item === 'daily' ? 'Informe quanto faturou em cada dia.' : 'Registre cada venda ou serviço com detalhes opcionais.'}</span></button>)}</div>

    {tier === 'basic' && <>
      <p><strong>3. Como você prefere registrar suas despesas?</strong></p>
      <div className={styles.modeGrid}>{BASIC_EXPENSE_MODES.map(item => <button type="button" className={`${styles.modeCard} ${expenseMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setExpenseMode(item)}><strong>{item === 'monthly' ? 'Total do mês' : 'Cada despesa'}</strong><span>{item === 'monthly' ? 'Informe apenas o total de gastos do mês.' : 'Registre cada gasto com fornecedor, categoria e pagamento opcionais.'}</span></button>)}</div>
    </>}

    <div className={styles.onboardingFields}>
      <label>Mês inicial<input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)}/></label>
      <div className={styles.infoBox}><strong>Como os valores são interpretados</strong><span>Receita significa faturamento bruto da venda ou serviço. No Básico, despesa significa gasto do negócio referente ao período. A Central não presume recebimento, pagamento ou saldo bancário.</span></div>
    </div>
    <button className={styles.primaryButton} disabled={busy || !startMonth} onClick={() => onSave({ tier, revenueMode, expenseMode, startMonth })}>{busy ? 'Configurando…' : tier === 'basic' ? 'Usar Controle Básico' : 'Usar Controle Simples'}</button>
  </div></div>;
}

function NavButton'''

pattern = r'function Onboarding\(\{ company, busy, onSave, onLogout \}\) \{.*?\n\}\n\nfunction NavButton'
simple, count = re.subn(pattern, new_onboarding, simple, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Onboarding component: target not found')
simple_path.write_text(simple, encoding='utf-8')

basic_path = Path('components/BasicControlAppV1.jsx')
basic = basic_path.read_text(encoding='utf-8')
basic = replace_once(
    basic,
    "    </main>\n\n    {modal && <Modal title={modalTitle(modal.type)} onClose={() => !busy && setModal(null)}>",
    "    </main>\n\n    <BasicMobileNav view={view} revenueDetailed={revenueMode === 'individual'} expenseDetailed={expenseMode === 'individual'} onNavigate={navigate}/>\n\n    {modal && <Modal title={modalTitle(modal.type)} wide={modal.type === 'revenueImport' || modal.type === 'expenseImport'} onClose={() => !busy && setModal(null)}>",
    'basic mobile nav insertion'
)

old_modal = "function Modal({ title, onClose, children }) { return <div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={styles.modalCard}><div className={styles.modalHead}><div><h3>{title}</h3></div><button onClick={onClose}>×</button></div>{children}</div></div>; }"
new_modal = "function Modal({ title, wide = false, onClose, children }) { return <div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`${styles.modal} ${wide ? styles.modalWide : ''}`}><div className={styles.modalHead}><div><span className={styles.eyebrow}>Controle Básico</span><h2>{title}</h2></div><button onClick={onClose}>×</button></div><div className={styles.modalBody}>{children}</div></div></div>; }"
basic = replace_once(basic, old_modal, new_modal, 'basic modal')

mobile = r'''
function BasicMobileNav({ view, revenueDetailed, expenseDetailed, onNavigate }) {
  const items = [['overview','home','Início'],['revenues','money','Receitas'],['expenses','expense','Despesas'],['reports','chart','Relatórios'],['more','more','Mais']];
  const [moreOpen, setMoreOpen] = useState(false);
  return <><div className={styles.mobileNav}>{items.map(([id, icon, label]) => <button key={id} className={view === id ? styles.mobileActive : ''} onClick={() => { if (id === 'more') setMoreOpen(true); else onNavigate(id); }}><Icon name={icon}/><span>{label}</span></button>)}</div>{moreOpen && <div className={styles.mobileMoreBackdrop} onClick={() => setMoreOpen(false)}><div className={styles.mobileMore} onClick={e => e.stopPropagation()}>
    {revenueDetailed && <button onClick={() => { onNavigate('customers'); setMoreOpen(false); }}><Icon name="users"/>Clientes</button>}
    {expenseDetailed && <button onClick={() => { onNavigate('suppliers'); setMoreOpen(false); }}><Icon name="truck"/>Fornecedores</button>}
    <button onClick={() => { onNavigate('closing'); setMoreOpen(false); }}><Icon name="check"/>Fechamento do mês</button>
    <button onClick={() => { onNavigate('settings'); setMoreOpen(false); }}><Icon name="settings"/>Configurações</button>
  </div></div>}</>;
}

'''
basic = replace_once(basic, '\nfunction modalTitle(type)', '\n' + mobile + 'function modalTitle(type)', 'basic mobile nav component')
basic_path.write_text(basic, encoding='utf-8')

css_path = Path('components/SimpleControlApp.module.css')
css = css_path.read_text(encoding='utf-8')
addon = '\n.formGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;grid-column:1/-1}.formActions{grid-column:1/-1;display:flex;justify-content:flex-end;padding-top:5px}.toolbar>input{box-sizing:border-box;color:#182230;font:400 12px Inter,sans-serif;background:#fff}@media(max-width:820px){.formGrid{grid-template-columns:1fr}.formActions{grid-column:auto}.toolbar>input{flex:1;min-width:105px}}\n'
if '.formActions{' not in css:
    css += addon
css_path.write_text(css, encoding='utf-8')
