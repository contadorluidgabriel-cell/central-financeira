from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


simple_path = Path('components/SimpleControlAppV2.jsx')
simple = simple_path.read_text(encoding='utf-8')

simple = replace_once(
    simple,
    "import { BASIC_EXPENSE_MODES, updateBasicSettings } from '../lib/neon-basic-control';",
    "import { BASIC_EXPENSE_MODES, scheduleControlTier, updateBasicSettings } from '../lib/neon-basic-control';",
    'scheduleControlTier import'
)

simple = replace_once(
    simple,
    "  }, [company?.id, company?.pendingRevenueMode, company?.pendingRevenueModeEffective, state?.currentMonth]);\n\n  const run = async (action, success) => {",
    "  }, [company?.id, company?.pendingRevenueMode, company?.pendingRevenueModeEffective, state?.currentMonth]);\n\n  useEffect(() => {\n    if (!company?.pendingControlTier || !company.pendingControlTierEffective || !state?.currentMonth) return;\n    if (company.pendingControlTierEffective > state.currentMonth) return;\n    let cancelled = false;\n    (async () => {\n      try {\n        await updateBasicSettings(company.id, {\n          controlTier: company.pendingControlTier,\n          expenseEnabled: company.pendingControlTier === 'basic',\n          expenseMode: company.pendingControlTier === 'basic' ? 'monthly' : 'monthly',\n          pendingControlTier: null,\n          pendingControlTierEffective: null\n        });\n        if (!cancelled) window.location.reload();\n      } catch (e) {\n        if (!cancelled) setError(normalizeSimpleError(e));\n      }\n    })();\n    return () => { cancelled = true; };\n  }, [company?.id, company?.pendingControlTier, company?.pendingControlTierEffective, state?.currentMonth]);\n\n  const run = async (action, success) => {",
    'tier activation effect'
)

simple = replace_once(
    simple,
    "currentMonth={state.currentMonth} onScheduleMode={mode => run(() => scheduleRevenueMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança programada para ${monthName(nextMonth(state.currentMonth))}.`)}",
    "currentMonth={state.currentMonth} onUpgradeBasic={() => run(() => scheduleControlTier(company.id, 'basic', nextMonth(state.currentMonth)), `Controle Básico programado para ${monthName(nextMonth(state.currentMonth))}.`)} onScheduleMode={mode => run(() => scheduleRevenueMode(company.id, mode, nextMonth(state.currentMonth)), `Mudança programada para ${monthName(nextMonth(state.currentMonth))}.`)}",
    'settings upgrade prop'
)

simple = replace_once(
    simple,
    "function Settings({ company, categories, paymentMethods, currentMonth, onScheduleMode, onAddCategory, onEditCategory, onToggleCategory, onAddPayment, onEditPayment, onTogglePayment }) {",
    "function Settings({ company, categories, paymentMethods, currentMonth, onUpgradeBasic, onScheduleMode, onAddCategory, onEditCategory, onToggleCategory, onAddPayment, onEditPayment, onTogglePayment }) {",
    'settings signature'
)

simple = replace_once(
    simple,
    "return <><PageHeader title=\"Configurações\" description=\"Ajuste como o Controle Simples organiza seu faturamento.\"/><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Modo de lançamento</h3>",
    "return <><PageHeader title=\"Configurações\" description=\"Ajuste como o Controle Simples organiza seu faturamento.\"/><div className={styles.settingsGrid}><section className={styles.panel}><div className={styles.panelHead}><div><h3>Nível de controle</h3><p>Você decide quando quer passar a acompanhar também as despesas.</p></div></div><div className={styles.settingsBody}><div className={styles.infoBox}><strong>Controle Simples</strong><span>Hoje você acompanha somente o faturamento. O Controle Básico acrescenta despesas e resultado gerencial, sem contas a pagar, receber ou caixa.</span></div><button className={styles.primaryButton} disabled={Boolean(company.pendingControlTier)} onClick={onUpgradeBasic}>{company.pendingControlTier === 'basic' ? `Controle Básico programado para ${monthName(company.pendingControlTierEffective)}` : 'Usar Controle Básico no próximo mês'}</button></div></section><section className={styles.panel}><div className={styles.panelHead}><div><h3>Modo de lançamento</h3>",
    'settings tier card'
)

simple_path.write_text(simple, encoding='utf-8')

lib_path = Path('lib/neon-simple-control.js')
lib = lib_path.read_text(encoding='utf-8')
lib = replace_once(
    lib,
    "query('organization_settings', 'organization_id,revenue_mode,control_tier,control_start_month,pending_revenue_mode,pending_revenue_mode_effective,active'),",
    "query('organization_settings', 'organization_id,revenue_mode,control_tier,control_start_month,pending_control_tier,pending_control_tier_effective,pending_revenue_mode,pending_revenue_mode_effective,active'),",
    'simple settings query'
)
lib = replace_once(
    lib,
    "      pendingRevenueMode: cfg.pending_revenue_mode || null,\n      pendingRevenueModeEffective: cfg.pending_revenue_mode_effective ? String(cfg.pending_revenue_mode_effective).slice(0, 7) : null,",
    "      pendingControlTier: cfg.pending_control_tier || null,\n      pendingControlTierEffective: cfg.pending_control_tier_effective ? String(cfg.pending_control_tier_effective).slice(0, 7) : null,\n      pendingRevenueMode: cfg.pending_revenue_mode || null,\n      pendingRevenueModeEffective: cfg.pending_revenue_mode_effective ? String(cfg.pending_revenue_mode_effective).slice(0, 7) : null,",
    'simple settings mapping'
)
lib_path.write_text(lib, encoding='utf-8')
