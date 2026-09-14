from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)

# --- SimpleControlAppV2 wiring ---
path = Path('components/SimpleControlAppV2.jsx')
text = path.read_text(encoding='utf-8')

text = replace_once(
    text,
    "  loadSimpleControlData,\n  markSimpleNotificationRead,",
    "  loadSimpleControlData,\n  importSimpleRevenueRows,\n  markSimpleNotificationRead,",
    'importSimpleRevenueRows import'
)
text = replace_once(
    text,
    "import styles from './SimpleControlApp.module.css';",
    "import styles from './SimpleControlApp.module.css';\nimport SimpleRevenueImport from './SimpleRevenueImport';",
    'SimpleRevenueImport component import'
)

old_revenues_render = """        {view === 'revenues' && <Revenues mode={periodMode} month={month} currentMonth={state.currentMonth} entries={currentEntries} categories={categories} customers={customers} paymentMethods={paymentMethods} locked={locked} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} onAdd={() => setModal({ type: 'revenue' })} onEdit={entry => setModal({ type: 'revenue', entry })} onDelete={entry => run(() => deleteSimpleRevenue(entry.id), 'Receita excluída.')} onCancel={entry => setModal({ type: 'cancel', entry })} onAdjustment={() => setModal({ type: 'adjustment' })}/>} """
new_revenues_render = """        {view === 'revenues' && <Revenues mode={periodMode} month={month} currentMonth={state.currentMonth} entries={currentEntries} categories={categories} customers={customers} paymentMethods={paymentMethods} locked={locked} search={search} setSearch={setSearch} filters={filters} setFilters={setFilters} onAdd={() => setModal({ type: 'revenue' })} onImport={() => setModal({ type: 'import' })} onEdit={entry => setModal({ type: 'revenue', entry })} onDelete={entry => run(() => deleteSimpleRevenue(entry.id), 'Receita excluída.')} onCancel={entry => setModal({ type: 'cancel', entry })} onAdjustment={() => setModal({ type: 'adjustment' })}/>} """
text = replace_once(text, old_revenues_render, new_revenues_render, 'Revenues render')

text = replace_once(
    text,
    "    {modal && <Modal title={modalTitle(modal.type)} onClose={() => !busy && setModal(null)}>",
    "    {modal && <Modal title={modalTitle(modal.type)} wide={modal.type === 'import'} onClose={() => !busy && setModal(null)}>",
    'Modal wide flag'
)

customer_marker = "      {modal.type === 'customer' && <CustomerForm"
import_block = """      {modal.type === 'import' && <SimpleRevenueImport mode={periodMode} month={month} existingEntries={currentEntries} categories={categories} customers={customers} paymentMethods={paymentMethods} busy={busy} onConfirm={async rows => {
        const result = await run(() => importSimpleRevenueRows({ organizationId: company.id, month, mode: periodMode, rows }), `${rows.length} ${rows.length === 1 ? 'receita importada' : 'receitas importadas'}.`);
        if (result !== null) setModal(null);
        return result;
      }}/>} 
"""
if customer_marker not in text:
    raise SystemExit('import modal marker: target not found')
text = text.replace(customer_marker, import_block + customer_marker, 1)

text = replace_once(
    text,
    "function Revenues({ mode, month, currentMonth, entries, categories, customers, paymentMethods, locked, search, setSearch, filters, setFilters, onAdd, onEdit, onDelete, onCancel, onAdjustment }) {",
    "function Revenues({ mode, month, currentMonth, entries, categories, customers, paymentMethods, locked, search, setSearch, filters, setFilters, onAdd, onImport, onEdit, onDelete, onCancel, onAdjustment }) {",
    'Revenues signature'
)

old_revenue_header = """    <PageHeader title="Receitas" description={`Faturamento de ${monthName(month).toLowerCase()}.`}>{!locked && <><button className={styles.secondaryButtonSmall} onClick={onAdjustment}>Ajuste</button><button className={styles.primaryButtonSmall} onClick={onAdd}><Icon name="plus"/>Registrar</button></>}</PageHeader>"""
new_revenue_header = """    <PageHeader title="Receitas" description={`Faturamento de ${monthName(month).toLowerCase()}.`}>{!locked && <><button className={styles.secondaryButtonSmall} onClick={onImport}><Icon name="download"/>Importar Excel/CSV</button><button className={styles.secondaryButtonSmall} onClick={onAdjustment}>Ajuste</button><button className={styles.primaryButtonSmall} onClick={onAdd}><Icon name="plus"/>Registrar</button></>}</PageHeader>"""
text = replace_once(text, old_revenue_header, new_revenue_header, 'Revenue header import button')

old_reports_return = """  return <><PageHeader title="Relatórios" description="Análises proporcionais ao nível de detalhe que você registra."><button className={styles.secondaryButtonSmall} onClick={exportCsv}><Icon name="download"/>Exportar CSV</button></PageHeader><div className={styles.reportGrid}><ReportCard title="Evolução mensal" rows={monthly.slice(-12).map(item => [monthName(item.key), item.value])}/>{mode === 'individual' && <><ReportCard title="Por cliente" rows={customersData.slice(0, 8)}/><ReportCard title="Por categoria" rows={categoriesData.slice(0, 8)}/><ReportCard title="Por meio de pagamento" rows={paymentData.slice(0, 8)}/></>}</div></>;"""
new_reports_return = """  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = entries.map(e => ({
      Data: formatDate(e.date),
      Competência: e.month,
      Valor: Number(e.amount || 0),
      Descrição: e.description || '',
      Cliente: e.customer?.name || '',
      Categoria: e.category?.name || '',
      'Meio de pagamento': e.paymentMethod?.name || '',
      Status: e.entry_status
    }));
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Receitas');
    XLSX.writeFile(workbook, `receitas-${company.name.replace(/\\s+/g, '-').toLowerCase()}.xlsx`);
  };
  return <><PageHeader title="Relatórios" description="Análises proporcionais ao nível de detalhe que você registra."><button className={styles.secondaryButtonSmall} onClick={exportCsv}><Icon name="download"/>CSV</button><button className={styles.secondaryButtonSmall} onClick={exportExcel}><Icon name="download"/>Excel</button></PageHeader><div className={styles.reportGrid}><ReportCard title="Evolução mensal" rows={monthly.slice(-12).map(item => [monthName(item.key), item.value])}/>{mode === 'individual' && <><ReportCard title="Por cliente" rows={customersData.slice(0, 8)}/><ReportCard title="Por categoria" rows={categoriesData.slice(0, 8)}/><ReportCard title="Por meio de pagamento" rows={paymentData.slice(0, 8)}/></>}</div></>;"""
text = replace_once(text, old_reports_return, new_reports_return, 'Reports Excel export')

text = replace_once(
    text,
    "function Modal({ title, onClose, children }) {\n  return <div className={styles.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={styles.modal}>",
    "function Modal({ title, wide = false, onClose, children }) {\n  return <div className={styles.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`${styles.modal} ${wide ? styles.modalWide : ''}`}>",
    'Modal wide class'
)
text = replace_once(
    text,
    "return ({ revenue: 'Registrar receita', customer: 'Cliente'",
    "return ({ revenue: 'Registrar receita', import: 'Importar receitas', customer: 'Cliente'",
    'modalTitle import'
)

path.write_text(text, encoding='utf-8')

# --- data layer: batch import only after preview/confirmation ---
path = Path('lib/neon-simple-control.js')
text = path.read_text(encoding='utf-8')
marker = "export async function deleteSimpleRevenue(entryId) {"
if marker not in text:
    raise SystemExit('data import marker: target not found')

batch_function = r'''export async function importSimpleRevenueRows({ organizationId, month, mode, rows }) {
  if (!SIMPLE_MODES.includes(mode)) throw new Error('Modo de faturamento inválido.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Selecione ao menos uma linha válida para importar.');

  await bootstrapSimpleOrganization(organizationId);

  const cleanRows = rows.map(row => ({
    date: row.date || null,
    amount: Number(row.amount || 0),
    description: normalizeText(row.description),
    categoryName: normalizeText(row.categoryName),
    customerName: normalizeText(row.customerName),
    document: normalizeText(row.document),
    paymentName: normalizeText(row.paymentName)
  }));
  if (cleanRows.some(row => !(row.amount > 0))) throw new Error('A importação contém valor inválido.');
  if (mode !== 'monthly' && cleanRows.some(row => !row.date || String(row.date).slice(0, 7) !== month)) throw new Error('A importação contém data fora do período selecionado.');
  if (mode === 'monthly' && cleanRows.length !== 1) throw new Error('No modo Total do mês, importe apenas uma linha por competência.');

  const existingResult = await neonTest.from('financial_entries')
    .select('id,occurred_on,mode,entry_status')
    .eq('organization_id', organizationId)
    .eq('competency', competencyDate(month))
    .eq('type', 'revenue');
  if (existingResult.error) throw existingResult.error;
  const activeExisting = (existingResult.data || []).filter(row => row.entry_status === 'active');
  if (mode === 'monthly' && activeExisting.some(row => row.mode === 'monthly')) throw new Error('Já existe um faturamento mensal ativo neste período.');
  if (mode === 'daily') {
    const dates = new Set();
    const existingDates = new Set(activeExisting.filter(row => row.mode === 'daily').map(row => String(row.occurred_on).slice(0, 10)));
    for (const row of cleanRows) {
      if (dates.has(row.date) || existingDates.has(row.date)) throw new Error(`Já existe um total diário para ${row.date}.`);
      dates.add(row.date);
    }
  }

  const normalizeKey = value => normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const documentKey = value => normalizeText(value).replace(/\D/g, '');
  const [categoryResult, customerResult, paymentResult] = await Promise.all([
    neonTest.from('financial_categories').select('id,name,active').eq('organization_id', organizationId).eq('type', 'revenue'),
    neonTest.from('finance_customers').select('id,name,document,is_consumer_final,merged_into,active').eq('organization_id', organizationId),
    neonTest.from('finance_payment_methods').select('id,name,active').eq('organization_id', organizationId)
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (customerResult.error) throw customerResult.error;
  if (paymentResult.error) throw paymentResult.error;

  const categoryByName = new Map((categoryResult.data || []).map(item => [normalizeKey(item.name), item.id]));
  const paymentByName = new Map((paymentResult.data || []).map(item => [normalizeKey(item.name), item.id]));
  const customerByName = new Map((customerResult.data || []).filter(item => !item.merged_into).map(item => [normalizeKey(item.name), item.id]));
  const customerByDocument = new Map((customerResult.data || []).filter(item => !item.merged_into && documentKey(item.document)).map(item => [documentKey(item.document), item.id]));
  let consumerFinalId = (customerResult.data || []).find(item => item.is_consumer_final && !item.merged_into)?.id || null;

  if (mode === 'individual') {
    for (const row of cleanRows) {
      if (row.categoryName) {
        const key = normalizeKey(row.categoryName);
        if (!categoryByName.has(key)) categoryByName.set(key, await saveSimpleCategory({ organizationId, name: row.categoryName }));
      }
      if (row.paymentName) {
        if (normalizeKey(row.paymentName) === 'a prazo') throw new Error('“A prazo” não pode ser usado como meio de pagamento.');
        const key = normalizeKey(row.paymentName);
        if (!paymentByName.has(key)) paymentByName.set(key, await saveSimplePaymentMethod({ organizationId, name: row.paymentName }));
      }
      if (row.customerName) {
        const doc = documentKey(row.document);
        const name = normalizeKey(row.customerName);
        const existingId = (doc && customerByDocument.get(doc)) || customerByName.get(name);
        if (!existingId) {
          const id = await saveSimpleCustomer({ organizationId, name: row.customerName, document: row.document });
          customerByName.set(name, id);
          if (doc) customerByDocument.set(doc, id);
        }
      }
    }
    if (!consumerFinalId) {
      const refreshed = await neonTest.from('finance_customers').select('id,is_consumer_final,merged_into').eq('organization_id', organizationId);
      if (refreshed.error) throw refreshed.error;
      consumerFinalId = (refreshed.data || []).find(item => item.is_consumer_final && !item.merged_into)?.id || null;
    }
  }

  const payloads = cleanRows.map(row => {
    let customerId = null;
    if (mode === 'individual') {
      const doc = documentKey(row.document);
      customerId = row.customerName
        ? ((doc && customerByDocument.get(doc)) || customerByName.get(normalizeKey(row.customerName)) || consumerFinalId)
        : consumerFinalId;
    }
    return {
      organization_id: organizationId,
      competency: competencyDate(month),
      occurred_on: mode === 'monthly' ? null : row.date,
      type: 'revenue',
      description: row.description,
      category_id: mode === 'individual' && row.categoryName ? (categoryByName.get(normalizeKey(row.categoryName)) || null) : null,
      customer_id: mode === 'individual' ? customerId : null,
      payment_method_id: mode === 'individual' && row.paymentName ? (paymentByName.get(normalizeKey(row.paymentName)) || null) : null,
      amount: row.amount,
      mode,
      entry_status: 'active',
      cancelled_at: null,
      cancel_reason: null,
      adjustment_kind: null,
      source_entry_id: null,
      updated_at: new Date().toISOString()
    };
  });

  const inserted = await neonTest.from('financial_entries').insert(payloads).select('id');
  if (inserted.error) throw inserted.error;
  return { count: inserted.data?.length || payloads.length, ids: (inserted.data || []).map(item => item.id) };
}

'''
text = text.replace(marker, batch_function + marker, 1)
path.write_text(text, encoding='utf-8')

# Wider modal only for import preview.
path = Path('components/SimpleControlApp.module.css')
text = path.read_text(encoding='utf-8')
if '.modalWide{' not in text:
    text += '.modalWide{width:min(1180px,calc(100vw - 36px));max-height:92vh}.modalWide .modalBody{overflow:auto}@media(max-width:780px){.modalWide{width:min(100% - 18px,1180px);max-height:94vh}}\n'
path.write_text(text, encoding='utf-8')

print('Simple Control import layer applied.')
