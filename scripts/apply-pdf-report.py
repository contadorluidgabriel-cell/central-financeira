from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


path = Path('components/SimpleControlAppV2.jsx')
text = path.read_text(encoding='utf-8')

text = replace_once(
    text,
    "import SimpleRevenueImport from './SimpleRevenueImport';\n",
    "import SimpleRevenueImport from './SimpleRevenueImport';\nimport { generateSimpleRevenuePdf } from '../lib/simple-report-pdf';\n",
    'pdf import'
)

old_reports = '''function Reports({ mode, company, month, entries }) {
  const months = [...new Set(entries.map(e => e.month))].sort();
  const monthly = months.map(key => ({ key, value: netBilling(entries.filter(e => e.month === key)) }));
  const current = entries.filter(e => e.month === month && e.entry_status === 'active');
  const group = (items, getKey) => [...items.reduce((map, item) => { const key = getKey(item) || 'Não informado'; map.set(key, (map.get(key) || 0) + Number(item.amount || 0)); return map; }, new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const categoriesData = group(current, e => e.category?.name);
  const customersData = group(current, e => e.customer?.name);
  const paymentData = group(current, e => e.paymentMethod?.name);
  const exportCsv = () => {
    const header = ['Data','Valor','Descrição','Cliente','Categoria','Meio de pagamento','Status'];
    const rows = entries.map(e => [formatDate(e.date), Number(e.amount || 0).toFixed(2).replace('.', ','), e.description || '', e.customer?.name || '', e.category?.name || '', e.paymentMethod?.name || '', e.entry_status]);
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\\n');
    const blob = new Blob([`\\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `receitas-${company.name.replace(/\\s+/g, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportExcel = async () => {
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
  return <><PageHeader title="Relatórios" description="Análises proporcionais ao nível de detalhe que você registra."><button className={styles.secondaryButtonSmall} onClick={exportCsv}><Icon name="download"/>CSV</button><button className={styles.secondaryButtonSmall} onClick={exportExcel}><Icon name="download"/>Excel</button></PageHeader><div className={styles.reportGrid}><ReportCard title="Evolução mensal" rows={monthly.slice(-12).map(item => [monthName(item.key), item.value])}/>{mode === 'individual' && <><ReportCard title="Por cliente" rows={customersData.slice(0, 8)}/><ReportCard title="Por categoria" rows={categoriesData.slice(0, 8)}/><ReportCard title="Por meio de pagamento" rows={paymentData.slice(0, 8)}/></>}</div></>;
}
'''

new_reports = '''function Reports({ mode, company, month, entries }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const months = [...new Set(entries.map(e => e.month))].sort();
  const monthly = months.map(key => ({ key, value: netBilling(entries.filter(e => e.month === key)) }));
  const current = entries.filter(e => e.month === month && e.entry_status === 'active');
  const group = (items, getKey) => [...items.reduce((map, item) => { const key = getKey(item) || 'Não informado'; map.set(key, (map.get(key) || 0) + Number(item.amount || 0)); return map; }, new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const categoriesData = group(current, e => e.category?.name);
  const customersData = group(current, e => e.customer?.name);
  const paymentData = group(current, e => e.paymentMethod?.name);
  const exportCsv = () => {
    const header = ['Data','Valor','Descrição','Cliente','Categoria','Meio de pagamento','Status'];
    const rows = entries.map(e => [formatDate(e.date), Number(e.amount || 0).toFixed(2).replace('.', ','), e.description || '', e.customer?.name || '', e.category?.name || '', e.paymentMethod?.name || '', e.entry_status]);
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\\n');
    const blob = new Blob([`\\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `receitas-${company.name.replace(/\\s+/g, '-').toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const exportExcel = async () => {
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
  const exportPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      await generateSimpleRevenuePdf({ company, month, mode, entries });
    } catch (error) {
      setPdfError(error?.message || 'Não foi possível gerar o PDF.');
    } finally {
      setPdfBusy(false);
    }
  };
  return <><PageHeader title="Relatórios" description="Análises proporcionais ao nível de detalhe que você registra."><button className={styles.primaryButtonSmall} disabled={pdfBusy} onClick={exportPdf}><Icon name="download"/>{pdfBusy ? 'Gerando PDF…' : 'PDF'}</button><button className={styles.secondaryButtonSmall} onClick={exportExcel}><Icon name="download"/>Excel</button><button className={styles.secondaryButtonSmall} onClick={exportCsv}><Icon name="download"/>CSV</button></PageHeader>{pdfError && <div className={styles.formError}>{pdfError}</div>}<div className={styles.reportGrid}><ReportCard title="Evolução mensal" rows={monthly.slice(-12).map(item => [monthName(item.key), item.value])}/>{mode === 'individual' && <><ReportCard title="Por cliente" rows={customersData.slice(0, 8)}/><ReportCard title="Por categoria" rows={categoriesData.slice(0, 8)}/><ReportCard title="Por meio de pagamento" rows={paymentData.slice(0, 8)}/></>}</div></>;
}
'''

text = replace_once(text, old_reports, new_reports, 'Reports')
path.write_text(text, encoding='utf-8')
