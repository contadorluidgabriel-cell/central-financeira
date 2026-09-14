'use client';

import { useMemo, useRef, useState } from 'react';
import {
  downloadBasicExpenseTemplate,
  parseBasicExpenseImport,
  selectedBasicExpenseCatalogs
} from '../lib/basic-expense-import';
import styles from './SimpleRevenueImport.module.css';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const modeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada despesa' })[mode] || mode;
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

export default function BasicExpenseImport({
  mode,
  month,
  existingEntries,
  categories,
  suppliers,
  paymentMethods,
  busy,
  onConfirm
}) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const rows = preview?.rows || [];
  const validRows = rows.filter(row => !row.errors.length);
  const selectedRows = rows.filter(row => row.selected && !row.errors.length);
  const warningRows = rows.filter(row => row.warnings.length);
  const errorRows = rows.filter(row => row.errors.length);
  const selectedCatalogs = useMemo(
    () => selectedBasicExpenseCatalogs(rows, categories, suppliers, paymentMethods),
    [rows, categories, suppliers, paymentMethods]
  );

  async function handleFile(file) {
    if (!file) return;
    setReading(true);
    setError('');
    try {
      const result = await parseBasicExpenseImport({
        file,
        mode,
        month,
        existingEntries,
        categories,
        suppliers,
        paymentMethods
      });
      setPreview(result);
    } catch (e) {
      setPreview(null);
      setError(e?.message || 'Não foi possível ler o arquivo.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function toggleRow(rowNumber) {
    setPreview(current => ({
      ...current,
      rows: current.rows.map(row => row.rowNumber === rowNumber && !row.errors.length ? { ...row, selected: !row.selected } : row)
    }));
  }

  function toggleAll() {
    const shouldSelect = validRows.some(row => !row.selected);
    setPreview(current => ({
      ...current,
      rows: current.rows.map(row => row.errors.length ? row : { ...row, selected: shouldSelect })
    }));
  }

  async function confirm() {
    if (!selectedRows.length || busy) return;
    await onConfirm(selectedRows);
  }

  if (!preview) {
    return <div className={styles.uploadStage}>
      <div className={styles.explainer}>
        <strong>Importação de despesas do período</strong>
        <span>O arquivo será conferido antes. Nenhum fornecedor, categoria, meio de pagamento ou despesa é criado sem sua confirmação.</span>
      </div>
      {error && <div className={styles.errorBox}>{error}</div>}
      <button type="button" className={styles.dropzone} disabled={reading} onClick={() => inputRef.current?.click()}>
        <span className={styles.fileIcon}>↑</span>
        <strong>{reading ? 'Lendo arquivo…' : 'Selecionar Excel ou CSV'}</strong>
        <small>.xlsx, .xls ou .csv · use a competência aberta na Central</small>
      </button>
      <input ref={inputRef} className={styles.hiddenInput} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={event => handleFile(event.target.files?.[0])}/>
      <div className={styles.templateRow}>
        <div><strong>Modelo para {modeName(mode)}</strong><span>Baixe o CSV com os títulos corretos e substitua a linha de exemplo.</span></div>
        <button type="button" onClick={() => downloadBasicExpenseTemplate(mode, month)}>Baixar modelo CSV</button>
      </div>
      <div className={styles.rules}>
        <strong>Antes de importar</strong>
        <span>Despesa representa um gasto do negócio referente ao período. O sistema não presume que o valor já saiu da conta bancária.</span>
        <span>{mode === 'monthly' ? 'Só pode existir um total mensal ativo de despesas no período.' : mode === 'daily' ? 'Só pode existir um total ativo de despesas por dia.' : 'Possíveis duplicidades são avisadas e começam desmarcadas, mas a decisão final continua sendo sua.'}</span>
      </div>
    </div>;
  }

  return <div className={styles.previewStage}>
    <div className={styles.previewHeader}>
      <div><strong>{preview.fileName}</strong><span>{modeName(mode)} · período {month}</span></div>
      <button type="button" onClick={() => { setPreview(null); setError(''); }}>Trocar arquivo</button>
    </div>

    <div className={styles.summaryGrid}>
      <Summary label="Linhas" value={rows.length}/>
      <Summary label="Selecionadas" value={selectedRows.length}/>
      <Summary label="Com aviso" value={warningRows.length} tone="warning"/>
      <Summary label="Com erro" value={errorRows.length} tone={errorRows.length ? 'error' : 'default'}/>
    </div>

    {(selectedCatalogs.newSuppliers.length || selectedCatalogs.newCategories.length || selectedCatalogs.newPayments.length) > 0 && <div className={styles.catalogNotice}>
      <strong>Novos cadastros serão criados somente ao confirmar</strong>
      <div>
        {selectedCatalogs.newSuppliers.map(item => <span key={`s-${item.name}`}>Fornecedor: {item.name}</span>)}
        {selectedCatalogs.newCategories.map(item => <span key={`g-${item}`}>Categoria: {item}</span>)}
        {selectedCatalogs.newPayments.map(item => <span key={`p-${item}`}>Pagamento: {item}</span>)}
      </div>
    </div>}

    <div className={styles.selectionBar}>
      <label><input type="checkbox" checked={validRows.length > 0 && validRows.every(row => row.selected)} onChange={toggleAll}/>Selecionar todas as linhas válidas</label>
      <span>Linhas com erro nunca são importadas. Possíveis duplicidades começam desmarcadas.</span>
    </div>

    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th></th><th>Linha</th><th>{mode === 'monthly' ? 'Mês' : 'Data'}</th><th>Valor</th><th>Descrição</th>{mode === 'individual' && <><th>Fornecedor</th><th>Categoria</th><th>Pagamento</th></>}<th>Conferência</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.rowNumber} className={row.errors.length ? styles.errorRow : row.warnings.length ? styles.warningRow : ''}>
          <td><input type="checkbox" checked={row.selected} disabled={Boolean(row.errors.length)} onChange={() => toggleRow(row.rowNumber)}/></td>
          <td>{row.rowNumber}</td>
          <td>{mode === 'monthly' ? (row.month || '—') : formatDate(row.date)}</td>
          <td className={styles.moneyCell}>{Number.isFinite(row.amount) ? money(row.amount) : '—'}</td>
          <td>{row.description || '—'}</td>
          {mode === 'individual' && <><td>{row.supplierName || 'Fornecedor não informado'}</td><td>{row.categoryName || '—'}</td><td>{row.paymentName || '—'}</td></>}
          <td><RowStatus row={row}/></td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className={styles.footer}>
      <div><strong>{selectedRows.length} {selectedRows.length === 1 ? 'linha pronta' : 'linhas prontas'} para importar</strong><span>Revise avisos e novos cadastros antes de continuar.</span></div>
      <button type="button" disabled={!selectedRows.length || busy} onClick={confirm}>{busy ? 'Importando…' : `Confirmar importação (${selectedRows.length})`}</button>
    </div>
  </div>;
}

function Summary({ label, value, tone = 'default' }) {
  return <div className={`${styles.summary} ${tone === 'warning' ? styles.summaryWarning : tone === 'error' ? styles.summaryError : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function RowStatus({ row }) {
  if (row.errors.length) return <div className={styles.messages}><b className={styles.errorTag}>Erro</b>{row.errors.map(message => <span key={message}>{message}</span>)}</div>;
  if (row.warnings.length) return <div className={styles.messages}><b className={styles.warningTag}>{row.duplicate ? 'Possível duplicidade' : 'Revisar'}</b>{row.warnings.map(message => <span key={message}>{message}</span>)}</div>;
  return <b className={styles.okTag}>Pronta</b>;
}
