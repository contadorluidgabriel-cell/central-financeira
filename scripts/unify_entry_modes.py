#!/usr/bin/env python3
"""Atualização de fontes com âncoras estritas; aborta se o código divergir."""
from pathlib import Path
R = Path(__file__).resolve().parents[1]

def edit(path, fn):
    f = R / path
    s = f.read_text(encoding='utf-8')
    result = fn(s)
    assert result != s, f'Nenhuma alteração em {path}'
    f.write_text(result, encoding='utf-8')
    print('Atualizado:', path)

def one(s, a, b):
    assert s.count(a) == 1, f'Âncora ambígua: {a[:90]!r}, total {s.count(a)}'
    return s.replace(a, b, 1)

def between(s, a, b, replacement):
    assert s.count(a) == s.count(b) == 1, f'Seção ambígua: {a[:80]!r} / {b[:80]!r}'
    i = s.index(a)
    j = s.index(b, i)
    return s[:i] + replacement + s[j:]

def simple(s):
    s = one(s, '  scheduleRevenueMode,\n', '')
    s = one(s, "import { BASIC_EXPENSE_MODES, updateBasicSettings } from '../lib/neon-basic-control';", "import { saveInitialEntryMode, scheduleUnifiedEntryMode, updateBasicSettings } from '../lib/neon-basic-control';\nimport { hasConflictingScheduledModes } from '../lib/entry-mode-policy.mjs';")
    s = between(s, '  useEffect(() => {\n    if (!company?.pendingRevenueMode', '  const run = async (action, success) => {', '''  useEffect(() => {
    if (!company || !state?.currentMonth) return;
    const revenueDue = Boolean(company.pendingRevenueMode && company.pendingRevenueModeEffective && company.pendingRevenueModeEffective <= state.currentMonth);
    const tierDue = Boolean(company.pendingControlTier && company.pendingControlTierEffective && company.pendingControlTierEffective <= state.currentMonth);
    if (!revenueDue && !tierDue) return;
    if (hasConflictingScheduledModes(company)) {
      setError('Mudanças antigas de receitas e despesas estão conflitantes. Escolha novamente a forma de lançamento em Configurações.');
      return;
    }
    const selectedMode = revenueDue ? company.pendingRevenueMode : company.revenueMode;
    if (tierDue && company.pendingExpenseMode && company.pendingExpenseModeEffective <= state.currentMonth && company.pendingExpenseMode !== selectedMode) {
      setError('O agendamento antigo de despesas diverge das receitas. Refaça a escolha antes de mudar de nível.');
      return;
    }
    const patch = { revenueMode: selectedMode, expenseMode: selectedMode };
    if (revenueDue) Object.assign(patch, { pendingRevenueMode: null, pendingRevenueModeEffective: null,
      pendingExpenseMode: null, pendingExpenseModeEffective: null });
    if (tierDue) {
      Object.assign(patch, { controlTier: company.pendingControlTier,
        pendingControlTier: null, pendingControlTierEffective: null });
      if (company.pendingExpenseMode && company.pendingExpenseModeEffective <= state.currentMonth)
        Object.assign(patch, { pendingExpenseMode: null, pendingExpenseModeEffective: null });
    }
    let cancelled = false;
    (async () => {
      try {
        await updateBasicSettings(company.id, patch);
        if (!cancelled) {
          if (tierDue) window.location.reload();
          else await refresh();
        }
      } catch (e) { if (!cancelled) setError(normalizeSimpleError(e)); }
    })();
    return () => { cancelled = true; };
  }, [company?.id, company?.revenueMode, company?.pendingRevenueMode, company?.pendingRevenueModeEffective,
    company?.pendingExpenseMode, company?.pendingExpenseModeEffective, company?.pendingControlTier,
    company?.pendingControlTierEffective, state?.currentMonth]);

''')
    s = one(s, 'return <Onboarding company={company} busy={busy} onSave={async ({ tier, revenueMode, expenseMode, startMonth: initialMonth }) => {', 'return <Onboarding company={company} busy={busy} onSave={async ({ tier, entryMode, startMonth: initialMonth }) => {')
    s = one(s, '''        await updateBasicSettings(company.id, {
          controlTier: tier,
          controlStartMonth: initialMonth,
          revenueMode,
          expenseEnabled: tier === 'basic',
          expenseMode: tier === 'basic' ? expenseMode : 'monthly'
        });''', '''        await saveInitialEntryMode(company.id, entryMode, {
          controlTier: tier,
          controlStartMonth: initialMonth,
          expenseEnabled: tier === 'basic'
        });''')
    s = between(s, 'onUpgradeBasic={expenseMode => run(', ' onAddCategory={() => setModal(', '''onUpgradeBasic={() => run(() => updateBasicSettings(company.id, {
          pendingControlTier: 'basic', pendingControlTierEffective: nextMonth(state.currentMonth),
          pendingRevenueMode: company.pendingRevenueMode || company.revenueMode,
          pendingExpenseMode: company.pendingRevenueMode || company.revenueMode,
          pendingRevenueModeEffective: nextMonth(state.currentMonth),
          pendingExpenseModeEffective: nextMonth(state.currentMonth)
        }), `Controle Básico programado para ${monthName(nextMonth(state.currentMonth))}.`)} onScheduleMode={mode => run(() => scheduleUnifiedEntryMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança programada para ${monthName(nextMonth(state.currentMonth))}.`)}''')
    s = between(s, 'function Onboarding({ company, busy, onSave, onLogout }) {', 'function NavButton({ active, icon, label, onClick }) {', '''function Onboarding({ company, busy, onSave, onLogout }) {
  const [tier, setTier] = useState('simple');
  const [entryMode, setEntryMode] = useState(company.revenueMode || 'monthly');
  const [startMonth, setStartMonth] = useState(monthKey());
  return <div className={styles.onboarding}><div className={styles.onboardingCard}>
    <div className={styles.onboardingTop}><div className={styles.brandMark}>LG</div><button onClick={onLogout}>Sair</button></div>
    <span className={styles.eyebrow}>Configuração da sua Central</span>
    <h1>Como você quer controlar sua empresa?</h1>
    <p>Escolha o nível e uma única forma de registro. Mudanças futuras valem no mês seguinte, sem alterar o histórico.</p>
    <p><strong>1. Escolha o nível de controle</strong></p>
    <div className={styles.modeGrid}>
      <button type="button" className={`${styles.modeCard} ${tier === 'simple' ? styles.modeCardActive : ''}`} onClick={() => setTier('simple')}><strong>Controle Simples</strong><span>Acompanha somente o faturamento.</span></button>
      <button type="button" className={`${styles.modeCard} ${tier === 'basic' ? styles.modeCardActive : ''}`} onClick={() => setTier('basic')}><strong>Controle Básico</strong><span>Acompanha faturamento, despesas e resultado gerencial.</span></button>
    </div>
    <p><strong>2. Como prefere registrar as movimentações?</strong></p>
    <div className={styles.modeGrid}>{SIMPLE_MODES.map(item => <button type="button" className={`${styles.modeCard} ${entryMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setEntryMode(item)}><strong>{item === 'individual' ? 'Cada lançamento' : modeName(item)}</strong><span>{item === 'monthly' ? 'Informe o total de cada mês.' : item === 'daily' ? 'Informe o total de cada dia.' : 'Registre cada movimentação separadamente.'}</span></button>)}</div>
    <div className={styles.onboardingFields}>
      <label>Mês inicial<input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)}/></label>
      <div className={styles.infoBox}><strong>Receitas e despesas continuam separadas</strong><span>{tier === 'simple' ? 'Por enquanto, apenas receitas. Se migrar para o Básico, as despesas seguirão o mesmo detalhamento.' : 'A escolha define só o detalhamento: receitas e despesas têm valores separados. A Central não presume saldo bancário.'}</span></div>
    </div>
    <button className={styles.primaryButton} disabled={busy || !startMonth} onClick={() => onSave({ tier, entryMode, startMonth })}>{busy ? 'Configurando…' : tier === 'basic' ? 'Usar Controle Básico' : 'Usar Controle Simples'}</button>
  </div></div>;
}

''')
    s = between(s, 'function Settings({ company, categories, paymentMethods, currentMonth, onUpgradeBasic,', 'function CatalogPanel({ title, items, onAdd, onEdit, onToggle }) {', '''function Settings({ company, categories, paymentMethods, currentMonth, onUpgradeBasic, onScheduleMode, onAddCategory, onEditCategory, onToggleCategory, onAddPayment, onEditPayment, onTogglePayment }) {
  const selected = company.pendingRevenueMode || company.revenueMode;
  const [mode, setMode] = useState(selected);
  useEffect(() => setMode(selected), [selected]);
  const scheduledTogether = Boolean(company.pendingRevenueMode && company.pendingRevenueMode === company.pendingExpenseMode && company.pendingRevenueModeEffective === company.pendingExpenseModeEffective);
  return <><PageHeader title="Configurações" description="Uma forma de registro para as movimentações do negócio."/><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Nível de controle</h3><p>Decida quando começar a acompanhar despesas.</p></div></div><div className={styles.settingsBody}><div className={styles.infoBox}><strong>Controle Simples</strong><span>O Controle Básico acrescenta despesas e resultado gerencial. As despesas seguirão o mesmo detalhamento das receitas.</span></div><button className={styles.primaryButton} disabled={Boolean(company.pendingControlTier)} onClick={onUpgradeBasic}>{company.pendingControlTier === 'basic' ? `Controle Básico programado para ${monthName(company.pendingControlTierEffective)}` : 'Usar Controle Básico no próximo mês'}</button></div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Forma de lançamento</h3><p>Mudanças valem no mês seguinte e preservam lançamentos anteriores.</p></div></div><div className={styles.settingsBody}><select value={mode} onChange={e => setMode(e.target.value)}>{SIMPLE_MODES.map(item => <option key={item} value={item}>{item === 'individual' ? 'Cada lançamento' : modeName(item)}</option>)}</select><button className={styles.secondaryButton} disabled={(scheduledTogether && mode === selected) || (!company.pendingRevenueMode && mode === company.revenueMode)} onClick={() => onScheduleMode(mode)}>Programar mudança</button>{company.pendingRevenueMode && <div className={styles.infoBox}><strong>Mudança programada</strong><span>{modeName(company.pendingRevenueMode)} a partir de {monthName(company.pendingRevenueModeEffective)}. O período atual permanece como está.</span></div>}</div></section><CatalogPanel title="Categorias" items={categories} onAdd={onAddCategory} onEdit={onEditCategory} onToggle={onToggleCategory}/><CatalogPanel title="Meios de pagamento" items={paymentMethods} onAdd={onAddPayment} onEdit={onEditPayment} onToggle={onTogglePayment}/></div></>;
}

''')
    return s

def basic(s):
    s = one(s, '  scheduleBasicRevenueMode,\n', '  scheduleUnifiedEntryMode,\n')
    s = one(s, '  scheduleExpenseMode,\n', '')
    s = one(s, "import styles from './SimpleControlApp.module.css';", "import styles from './SimpleControlApp.module.css';\nimport { hasConflictingScheduledModes } from '../lib/entry-mode-policy.mjs';")
    s = one(s, '    const tasks = {};\n    if (company.pendingRevenueMode', "    if (hasConflictingScheduledModes(company)) {\n      setError('Agendamentos antigos de receitas e despesas estão conflitantes. Escolha novamente uma forma única em Configurações.');\n      return;\n    }\n    const tasks = {};\n    if (company.pendingRevenueMode")
    s = between(s, '          onRevenueMode={mode => run(', '          onTier={tier => run(', '''          onEntryMode={mode => run(() => scheduleUnifiedEntryMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança de lançamentos programada para ${monthName(nextMonth(state.currentMonth))}.`)}
''')
    s = between(s, 'function Settings({ company, currentMonth, revenueCategories,', 'function CatalogPanel({ title, items, onAdd, onEdit, onToggle }) {', '''function Settings({ company, currentMonth, revenueCategories, expenseCategories, paymentMethods, onEntryMode, onTier, onRevenueCategory, onExpenseCategory, onToggleRevenueCategory, onToggleExpenseCategory, onPayment, onTogglePayment }) {
  const scheduledTogether = Boolean(company.pendingRevenueMode && company.pendingRevenueMode === company.pendingExpenseMode && company.pendingRevenueModeEffective === company.pendingExpenseModeEffective);
  const selected = scheduledTogether ? company.pendingRevenueMode : company.revenueMode;
  const [entryMode, setEntryMode] = useState(selected);
  useEffect(() => setEntryMode(selected), [selected]);
  const differentToday = company.revenueMode !== company.expenseMode;
  const conflictingSchedules = hasConflictingScheduledModes(company);
  return <><PageHeader title="Configurações" description="Uma preferência de detalhamento para receitas e despesas."/><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Nível de controle</h3><p>Controle Básico acompanha faturamento, despesas e resultado gerencial.</p></div></div><div className={styles.settingsBody}><div className={styles.infoBox}><strong>Controle Básico ativo</strong><span>Não inclui contas a pagar, contas a receber, parcelamentos, saldos bancários ou fluxo de caixa projetado.</span></div><button className={styles.secondaryButton} onClick={() => onTier('simple')}>Voltar ao Controle Simples no próximo mês</button>{company.pendingControlTier && <div className={styles.infoBox}><strong>Mudança programada</strong><span>{company.pendingControlTier === 'simple' ? 'Controle Simples' : 'Controle Básico'} a partir de {monthName(company.pendingControlTierEffective)}.</span></div>}</div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Forma de lançamento</h3><p>Uma escolha para receitas e despesas a partir do próximo mês.</p></div></div><div className={styles.settingsBody}>{differentToday && <div className={styles.infoBox}><strong>Configuração anterior diferente</strong><span>O mês atual possui receitas e despesas com detalhamentos distintos. Registros e fechamentos antigos serão preservados. Programe uma forma única para o próximo mês.</span></div>}{conflictingSchedules && <div className={styles.infoBox}><strong>Agendamentos anteriores conflitantes</strong><span>Escolha novamente uma opção para substituir os dois agendamentos juntos.</span></div>}<select value={entryMode} onChange={e => setEntryMode(e.target.value)}>{SIMPLE_MODES.map(item => <option key={item} value={item}>{item === 'monthly' ? 'Total do mês' : item === 'daily' ? 'Total por dia' : 'Cada lançamento'}</option>)}</select><button className={styles.secondaryButton} disabled={(scheduledTogether && entryMode === company.pendingRevenueMode) || (!differentToday && !company.pendingRevenueMode && !company.pendingExpenseMode && entryMode === company.revenueMode)} onClick={() => onEntryMode(entryMode)}>Programar mudança</button>{scheduledTogether && <div className={styles.infoBox}><strong>Mudança programada</strong><span>{entryMode === 'individual' ? 'Cada lançamento' : entryMode === 'daily' ? 'Total por dia' : 'Total do mês'} a partir de {monthName(company.pendingRevenueModeEffective)}.</span></div>}</div></section><CatalogPanel title="Categorias de receitas" items={revenueCategories} onAdd={() => onRevenueCategory()} onEdit={onRevenueCategory} onToggle={onToggleRevenueCategory}/><CatalogPanel title="Categorias de despesas" items={expenseCategories} onAdd={() => onExpenseCategory()} onEdit={onExpenseCategory} onToggle={onToggleExpenseCategory}/><CatalogPanel title="Meios de pagamento" items={paymentMethods} onAdd={() => onPayment()} onEdit={onPayment} onToggle={onTogglePayment}/></div><div className={styles.infoBox} style={{marginTop:12}}><strong>Histórico preservado</strong><span>Esta escolha não reinterpreta períodos anteriores. Cada fechamento mantém as configurações utilizadas naquele mês.</span></div></>;
}

''')
    return s

def simple_legacy(s):
    s = one(s, "  if (Object.prototype.hasOwnProperty.call(patch, 'revenueMode')) payload.revenue_mode = patch.revenueMode;", "  if (Object.prototype.hasOwnProperty.call(patch, 'revenueMode')) { payload.revenue_mode = patch.revenueMode; payload.expense_mode = patch.revenueMode; }")
    s = one(s, "  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueMode')) payload.pending_revenue_mode = patch.pendingRevenueMode || null;", "  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueMode')) { payload.pending_revenue_mode = patch.pendingRevenueMode || null; payload.pending_expense_mode = patch.pendingRevenueMode || null; }")
    s = one(s, "  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueModeEffective')) payload.pending_revenue_mode_effective = patch.pendingRevenueModeEffective ? competencyDate(patch.pendingRevenueModeEffective) : null;", "  if (Object.prototype.hasOwnProperty.call(patch, 'pendingRevenueModeEffective')) { payload.pending_revenue_mode_effective = patch.pendingRevenueModeEffective ? competencyDate(patch.pendingRevenueModeEffective) : null; payload.pending_expense_mode_effective = patch.pendingRevenueModeEffective ? competencyDate(patch.pendingRevenueModeEffective) : null; }")
    return s

def admin(s):
    s = one(s, 'O cliente escolhe o nível de controle e os modos de receitas e despesas no próprio acesso.', 'O cliente escolhe o nível de controle e uma forma única de lançamento para receitas e despesas no próprio acesso.')
    s = one(s, 'os modos de receitas e despesas e o mês inicial', 'a forma única de registro e o mês inicial')
    return s

edit('components/SimpleControlAppV2.jsx', simple)
edit('components/BasicControlAppV1.jsx', basic)
edit('lib/neon-simple-control-legacy.js', simple_legacy)
edit('components/CentralFinanceiraV2.jsx', admin)
print('Não houve alteração de dados, lançamentos ou snapshots históricos.')
