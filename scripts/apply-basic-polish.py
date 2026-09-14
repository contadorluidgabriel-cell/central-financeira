from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


simple_path = Path('components/SimpleControlAppV2.jsx')
simple = simple_path.read_text(encoding='utf-8')

simple = replace_once(
    simple,
    "          expenseMode: company.pendingControlTier === 'basic' ? 'monthly' : 'monthly',\n          pendingControlTier: null,\n          pendingControlTierEffective: null",
    "          expenseMode: company.pendingControlTier === 'basic' ? (company.pendingExpenseMode || 'monthly') : 'monthly',\n          pendingControlTier: null,\n          pendingControlTierEffective: null,\n          pendingExpenseMode: null,\n          pendingExpenseModeEffective: null",
    'activate selected expense mode'
)

simple = replace_once(
    simple,
    "  }, [company?.id, company?.pendingControlTier, company?.pendingControlTierEffective, state?.currentMonth]);",
    "  }, [company?.id, company?.pendingControlTier, company?.pendingControlTierEffective, company?.pendingExpenseMode, state?.currentMonth]);",
    'tier effect dependencies'
)

old_upgrade = "onUpgradeBasic={() => run(() => scheduleControlTier(company.id, 'basic', nextMonth(state.currentMonth)), `Controle Básico programado para ${monthName(nextMonth(state.currentMonth))}.`)}"
new_upgrade = "onUpgradeBasic={expenseMode => run(() => updateBasicSettings(company.id, { pendingControlTier: 'basic', pendingControlTierEffective: nextMonth(state.currentMonth), pendingExpenseMode: expenseMode, pendingExpenseModeEffective: nextMonth(state.currentMonth) }), `Controle Básico programado para ${monthName(nextMonth(state.currentMonth))}.`)}"
simple = replace_once(simple, old_upgrade, new_upgrade, 'upgrade action with expense choice')

simple = replace_once(
    simple,
    "  const [mode, setMode] = useState(company.pendingRevenueMode || company.revenueMode);\n  useEffect(() => setMode(company.pendingRevenueMode || company.revenueMode), [company.pendingRevenueMode, company.revenueMode]);",
    "  const [mode, setMode] = useState(company.pendingRevenueMode || company.revenueMode);\n  const [basicExpenseMode, setBasicExpenseMode] = useState(company.pendingExpenseMode || 'monthly');\n  useEffect(() => setMode(company.pendingRevenueMode || company.revenueMode), [company.pendingRevenueMode, company.revenueMode]);\n  useEffect(() => setBasicExpenseMode(company.pendingExpenseMode || 'monthly'), [company.pendingExpenseMode]);",
    'upgrade expense state'
)

old_tier_body = "<div className={styles.settingsBody}><div className={styles.infoBox}><strong>Controle Simples</strong><span>Hoje você acompanha somente o faturamento. O Controle Básico acrescenta despesas e resultado gerencial, sem contas a pagar, receber ou caixa.</span></div><button className={styles.primaryButton} disabled={Boolean(company.pendingControlTier)} onClick={onUpgradeBasic}>{company.pendingControlTier === 'basic' ? `Controle Básico programado para ${monthName(company.pendingControlTierEffective)}` : 'Usar Controle Básico no próximo mês'}</button></div>"
new_tier_body = "<div className={styles.settingsBody}><div className={styles.infoBox}><strong>Controle Simples</strong><span>Hoje você acompanha somente o faturamento. O Controle Básico acrescenta despesas e resultado gerencial, sem contas a pagar, receber ou caixa.</span></div>{!company.pendingControlTier && <label>Como você quer registrar as despesas?<select value={basicExpenseMode} onChange={e => setBasicExpenseMode(e.target.value)}>{BASIC_EXPENSE_MODES.map(item => <option key={item} value={item}>{item === 'monthly' ? 'Total do mês' : 'Cada despesa'}</option>)}</select></label>}<button className={styles.primaryButton} disabled={Boolean(company.pendingControlTier)} onClick={() => onUpgradeBasic(basicExpenseMode)}>{company.pendingControlTier === 'basic' ? `Controle Básico programado para ${monthName(company.pendingControlTierEffective)} · despesas: ${company.pendingExpenseMode === 'individual' ? 'Cada despesa' : 'Total do mês'}` : 'Usar Controle Básico no próximo mês'}</button></div>"
simple = replace_once(simple, old_tier_body, new_tier_body, 'tier card expense choice')
simple_path.write_text(simple, encoding='utf-8')

lib_path = Path('lib/neon-simple-control.js')
lib = lib_path.read_text(encoding='utf-8')
lib = replace_once(
    lib,
    "pending_control_tier,pending_control_tier_effective,pending_revenue_mode,pending_revenue_mode_effective,active",
    "pending_control_tier,pending_control_tier_effective,pending_revenue_mode,pending_revenue_mode_effective,pending_expense_mode,pending_expense_mode_effective,active",
    'pending expense fields query'
)
lib = replace_once(
    lib,
    "      pendingRevenueMode: cfg.pending_revenue_mode || null,\n      pendingRevenueModeEffective: cfg.pending_revenue_mode_effective ? String(cfg.pending_revenue_mode_effective).slice(0, 7) : null,",
    "      pendingRevenueMode: cfg.pending_revenue_mode || null,\n      pendingRevenueModeEffective: cfg.pending_revenue_mode_effective ? String(cfg.pending_revenue_mode_effective).slice(0, 7) : null,\n      pendingExpenseMode: cfg.pending_expense_mode || null,\n      pendingExpenseModeEffective: cfg.pending_expense_mode_effective ? String(cfg.pending_expense_mode_effective).slice(0, 7) : null,",
    'pending expense fields mapping'
)
lib_path.write_text(lib, encoding='utf-8')

basic_path = Path('components/BasicControlAppV1.jsx')
basic = basic_path.read_text(encoding='utf-8')

basic = replace_once(
    basic,
    "onQuickCustomer={() => setModal({ type: 'customer', returnTo: 'revenue' })}",
    "onQuickCustomer={draft => setModal({ type: 'customer', returnToRevenue: true, revenueDraft: draft })}",
    'quick customer draft'
)
basic = replace_once(
    basic,
    "onQuickSupplier={() => setModal({ type: 'supplier', returnTo: 'expense' })}",
    "onQuickSupplier={draft => setModal({ type: 'supplier', returnToExpense: true, expenseDraft: draft })}",
    'quick supplier draft'
)

old_customer = "{modal.type === 'customer' && <PartyForm kind=\"customer\" party={modal.party} busy={busy} onSubmit={async values => { const result = await run(() => saveSimpleCustomer({ organizationId: company.id, existingId: modal.party?.id, ...values }), modal.party ? 'Cliente atualizado.' : 'Cliente criado.'); if (result) setModal(null); }}/>}"
new_customer = "{modal.type === 'customer' && <PartyForm kind=\"customer\" party={modal.party} busy={busy} onSubmit={async values => { const sameName = customers.find(p => p.id !== modal.party?.id && p.name.toLowerCase() === values.name.trim().toLowerCase()); const sameDocument = values.document && customers.find(p => p.id !== modal.party?.id && String(p.document || '').replace(/\\D/g, '') === String(values.document).replace(/\\D/g, '')); if (sameDocument && !window.confirm(`O CPF/CNPJ já aparece em ${sameDocument.name}. Deseja salvar mesmo assim?`)) return; if (sameName && !window.confirm(`Já existe um cliente chamado ${sameName.name}. Deseja continuar?`)) return; const result = await run(() => saveSimpleCustomer({ organizationId: company.id, existingId: modal.party?.id, ...values }), modal.party ? 'Cliente atualizado.' : 'Cliente criado.'); if (result) { if (modal.returnToRevenue) setModal({ type: 'revenue', draft: { ...(modal.revenueDraft || {}), customerId: result } }); else setModal(null); } }}/>}"
basic = replace_once(basic, old_customer, new_customer, 'customer duplicate and return')

old_supplier = "{modal.type === 'supplier' && <PartyForm kind=\"supplier\" party={modal.party} busy={busy} onSubmit={async values => { const result = await run(() => saveBasicSupplier({ organizationId: company.id, existingId: modal.party?.id, ...values }), modal.party ? 'Fornecedor atualizado.' : 'Fornecedor criado.'); if (result) setModal(null); }}/>}"
new_supplier = "{modal.type === 'supplier' && <PartyForm kind=\"supplier\" party={modal.party} busy={busy} onSubmit={async values => { const sameName = suppliers.find(p => p.id !== modal.party?.id && p.name.toLowerCase() === values.name.trim().toLowerCase()); const sameDocument = values.document && suppliers.find(p => p.id !== modal.party?.id && String(p.document || '').replace(/\\D/g, '') === String(values.document).replace(/\\D/g, '')); if (sameDocument && !window.confirm(`O CPF/CNPJ já aparece em ${sameDocument.name}. Deseja salvar mesmo assim?`)) return; if (sameName && !window.confirm(`Já existe um fornecedor chamado ${sameName.name}. Deseja continuar?`)) return; const result = await run(() => saveBasicSupplier({ organizationId: company.id, existingId: modal.party?.id, ...values }), modal.party ? 'Fornecedor atualizado.' : 'Fornecedor criado.'); if (result) { if (modal.returnToExpense) setModal({ type: 'expense', draft: { ...(modal.expenseDraft || {}), supplierId: result } }); else setModal(null); } }}/>}"
basic = replace_once(basic, old_supplier, new_supplier, 'supplier duplicate and return')

basic = replace_once(
    basic,
    "<RevenueForm mode={revenueMode} entry={modal.entry}",
    "<RevenueForm mode={revenueMode} entry={modal.entry} draft={modal.draft}",
    'revenue draft prop'
)
basic = replace_once(
    basic,
    "<ExpenseForm mode={expenseMode} entry={modal.entry}",
    "<ExpenseForm mode={expenseMode} entry={modal.entry} draft={modal.draft}",
    'expense draft prop'
)

basic = replace_once(
    basic,
    "function RevenueForm({ mode, entry, categories, customers, paymentMethods, busy, onQuickCustomer, onSubmit }) {\n  const [form, setForm] = useState({ date: entry?.date ? String(entry.date).slice(0,10) : today(), amount: entry?.amount ?? '', description: entry?.description ?? '', categoryId: entry?.category_id ?? '', customerId: entry?.customer_id ?? customers.find(c => c.is_consumer_final)?.id ?? '', paymentMethodId: entry?.payment_method_id ?? '' });",
    "function RevenueForm({ mode, entry, draft, categories, customers, paymentMethods, busy, onQuickCustomer, onSubmit }) {\n  const base = draft || {};\n  const [form, setForm] = useState({ date: base.date || (entry?.date ? String(entry.date).slice(0,10) : today()), amount: base.amount ?? entry?.amount ?? '', description: base.description ?? entry?.description ?? '', categoryId: base.categoryId ?? entry?.category_id ?? '', customerId: base.customerId ?? entry?.customer_id ?? customers.find(c => c.is_consumer_final)?.id ?? '', paymentMethodId: base.paymentMethodId ?? entry?.payment_method_id ?? '' });",
    'revenue form draft state'
)
basic = replace_once(
    basic,
    '<button type="button" className={styles.secondaryButtonSmall} onClick={onQuickCustomer}>Novo cliente</button>',
    '<button type="button" className={styles.secondaryButtonSmall} onClick={() => onQuickCustomer(form)}>Novo cliente</button>',
    'revenue quick customer button'
)

basic = replace_once(
    basic,
    "function ExpenseForm({ mode, entry, categories, suppliers, paymentMethods, busy, onQuickSupplier, onSubmit }) {\n  const [form, setForm] = useState({ date: entry?.date ? String(entry.date).slice(0,10) : today(), amount: entry?.amount ?? '', description: entry?.description ?? '', categoryId: entry?.category_id ?? '', supplierId: entry?.supplier_id ?? suppliers.find(s => s.is_unspecified)?.id ?? '', paymentMethodId: entry?.payment_method_id ?? '' });",
    "function ExpenseForm({ mode, entry, draft, categories, suppliers, paymentMethods, busy, onQuickSupplier, onSubmit }) {\n  const base = draft || {};\n  const [form, setForm] = useState({ date: base.date || (entry?.date ? String(entry.date).slice(0,10) : today()), amount: base.amount ?? entry?.amount ?? '', description: base.description ?? entry?.description ?? '', categoryId: base.categoryId ?? entry?.category_id ?? '', supplierId: base.supplierId ?? entry?.supplier_id ?? suppliers.find(s => s.is_unspecified)?.id ?? '', paymentMethodId: base.paymentMethodId ?? entry?.payment_method_id ?? '' });",
    'expense form draft state'
)
basic = replace_once(
    basic,
    '<button type="button" className={styles.secondaryButtonSmall} onClick={onQuickSupplier}>Novo fornecedor</button>',
    '<button type="button" className={styles.secondaryButtonSmall} onClick={() => onQuickSupplier(form)}>Novo fornecedor</button>',
    'expense quick supplier button'
)

basic = replace_once(
    basic,
    "    const rows = entries.map(e => [e.type === 'revenue' ? 'Receita' : 'Despesa', formatDate(e.date), e.month, Number(e.amount || 0).toFixed(2).replace('.', ','), e.description || '', e.type === 'revenue' ? (e.customer?.name || '') : (e.supplier?.name || ''), e.category?.name || '', e.paymentMethod?.name || '', e.entry_status]);",
    "    const rows = current.map(e => [e.type === 'revenue' ? 'Receita' : 'Despesa', formatDate(e.date), e.month, Number(e.amount || 0).toFixed(2).replace('.', ','), e.description || '', e.type === 'revenue' ? (e.customer?.name || '') : (e.supplier?.name || ''), e.category?.name || '', e.paymentMethod?.name || '', e.entry_status]);",
    'csv current period'
)
basic = replace_once(
    basic,
    "    const rows = entries.map(e => ({ Tipo: e.type === 'revenue' ? 'Receita' : 'Despesa', Data: formatDate(e.date), Competência: e.month, Valor: Number(e.amount || 0), Descrição: e.description || '', Cliente_Fornecedor: e.type === 'revenue' ? (e.customer?.name || '') : (e.supplier?.name || ''), Categoria: e.category?.name || '', 'Meio de pagamento': e.paymentMethod?.name || '', Status: e.entry_status }));",
    "    const rows = current.map(e => ({ Tipo: e.type === 'revenue' ? 'Receita' : 'Despesa', Data: formatDate(e.date), Competência: e.month, Valor: Number(e.amount || 0), Descrição: e.description || '', Cliente_Fornecedor: e.type === 'revenue' ? (e.customer?.name || '') : (e.supplier?.name || ''), Categoria: e.category?.name || '', 'Meio de pagamento': e.paymentMethod?.name || '', Status: e.entry_status }));",
    'excel current period'
)

basic_path.write_text(basic, encoding='utf-8')
