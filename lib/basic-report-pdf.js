'use client';

const COLORS = {
  blue: [36, 86, 232],
  blueSoft: [238, 243, 255],
  navy: [24, 34, 48],
  secondary: [102, 112, 133],
  bg: [246, 248, 252],
  border: [228, 233, 241],
  success: [22, 131, 74],
  danger: [180, 35, 24],
  white: [255, 255, 255]
};

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const percent = value => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-';
const slug = value => String(value || 'empresa').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';
const monthLabel = key => {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || 'Período não informado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1)).replace(/^./, char => char.toUpperCase());
};
const shortMonth = key => {
  const [year, month] = String(key || '').split('-').map(Number);
  return year && month ? `${String(month).padStart(2, '0')}/${String(year).slice(-2)}` : key || '';
};
const previousMonth = key => {
  const [year, month] = String(key).split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const sum = items => items.reduce((total, item) => total + Number(item || 0), 0);
const adjustments = (entries, kind) => sum(entries.filter(entry => entry.entry_status === 'adjustment' && entry.adjustment_kind === kind).map(entry => entry.amount));
const activeTotal = entries => sum(entries.filter(entry => entry.entry_status === 'active').map(entry => entry.amount));
const revenueNet = entries => activeTotal(entries) + adjustments(entries, 'positive') - adjustments(entries, 'negative');
const expenseNet = entries => activeTotal(entries) + adjustments(entries, 'positive') - adjustments(entries, 'negative');

function group(items, getKey) {
  return [...items.reduce((map, item) => {
    const key = getKey(item) || 'Não informado';
    map.set(key, (map.get(key) || 0) + Number(item.amount || 0));
    return map;
  }, new Map()).entries()].sort((a, b) => b[1] - a[1]);
}

function setText(doc, color = COLORS.navy, size = 10, style = 'normal') {
  doc.setTextColor(...color);
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

function card(doc, x, y, width, height, fill = COLORS.white, stroke = COLORS.border) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, 'FD');
}

function header(doc, { company, month, revenueMode, expenseMode, pageWidth }) {
  doc.setFillColor(...COLORS.blue);
  doc.roundedRect(14, 12, 13, 13, 2.4, 2.4, 'F');
  setText(doc, COLORS.white, 9.5, 'bold');
  doc.text('LG', 20.5, 20.5, { align: 'center' });
  setText(doc, COLORS.navy, 15, 'bold');
  doc.text('Relatório Gerencial', 32, 17.3);
  setText(doc, COLORS.secondary, 8.2, 'normal');
  doc.text('Central Financeira · Controle Básico', 32, 22.5);
  setText(doc, COLORS.navy, 9.2, 'bold');
  doc.text(company?.name || 'Empresa', pageWidth - 14, 16.3, { align: 'right' });
  setText(doc, COLORS.secondary, 7.6, 'normal');
  doc.text(company?.document ? `CNPJ/CPF: ${company.document}` : 'Documento não informado', pageWidth - 14, 21, { align: 'right' });
  doc.text(`${monthLabel(month)} · Receitas: ${revenueMode} · Despesas: ${expenseMode}`, pageWidth - 14, 25.2, { align: 'right' });
  doc.setDrawColor(...COLORS.border);
  doc.line(14, 30, pageWidth - 14, 30);
}

function footer(doc, pageWidth, pageHeight) {
  const page = doc.internal.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();
  doc.setDrawColor(...COLORS.border);
  doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);
  setText(doc, COLORS.secondary, 7.2, 'normal');
  doc.text('Relatório gerencial baseado nos dados informados pelo cliente. Não substitui escrituração contábil ou fiscal.', 14, pageHeight - 7.4);
  doc.text(`Página ${page} de ${total}`, pageWidth - 14, pageHeight - 7.4, { align: 'right' });
}

function kpi(doc, x, y, width, label, value, detail, tone = 'default') {
  card(doc, x, y, width, 25, tone === 'blue' ? COLORS.blueSoft : COLORS.white);
  setText(doc, COLORS.secondary, 7.2, 'bold');
  doc.text(label.toUpperCase(), x + 4, y + 6);
  setText(doc, tone === 'success' ? COLORS.success : tone === 'danger' ? COLORS.danger : COLORS.navy, 12.2, 'bold');
  doc.text(String(value), x + 4, y + 14.3, { maxWidth: width - 8 });
  setText(doc, COLORS.secondary, 6.8, 'normal');
  doc.text(String(detail || ''), x + 4, y + 20.3, { maxWidth: width - 8 });
}

function evolution(doc, monthly, x, y, width) {
  card(doc, x, y, width, 57);
  setText(doc, COLORS.navy, 9.5, 'bold');
  doc.text('Evolução de faturamento, despesas e resultado', x + 4, y + 7);
  setText(doc, COLORS.secondary, 7.1, 'normal');
  doc.text('Valores após ajustes por competência', x + 4, y + 11.2);
  if (!monthly.length) {
    doc.text('Sem dados suficientes.', x + 4, y + 30);
    return;
  }
  const chartX = x + 7;
  const chartY = y + 18;
  const chartHeight = 25;
  const groupWidth = (width - 14) / monthly.length;
  const max = Math.max(1, ...monthly.flatMap(item => [item.revenue, item.expense, Math.max(0, item.result)]));
  monthly.forEach((item, index) => {
    const gx = chartX + index * groupWidth;
    const barW = Math.max(1.8, Math.min(4, groupWidth / 4));
    const values = [item.revenue, item.expense, Math.max(0, item.result)];
    values.forEach((value, offset) => {
      const h = Math.max(1, Number(value || 0) / max * chartHeight);
      const bx = gx + offset * (barW + 1);
      if (offset === 0) doc.setFillColor(...COLORS.blue);
      if (offset === 1) doc.setFillColor(...COLORS.danger);
      if (offset === 2) doc.setFillColor(...COLORS.success);
      doc.roundedRect(bx, chartY + chartHeight - h, barW, h, .6, .6, 'F');
    });
    setText(doc, COLORS.secondary, 5.8, 'normal');
    doc.text(shortMonth(item.key), gx + barW * 2, chartY + chartHeight + 5, { align: 'center' });
  });
  setText(doc, COLORS.secondary, 6.3, 'normal');
  doc.text('Azul: faturamento   Vermelho: despesas   Verde: resultado gerencial', x + 4, y + 53);
}

function summaryTable(autoTable, doc, title, rows, startY, pageWidth) {
  setText(doc, COLORS.navy, 9.2, 'bold');
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    margin: { left: 14, right: 14, bottom: 18 },
    head: [['Descrição', 'Valor']],
    body: rows.length ? rows.slice(0, 10).map(([label, value]) => [label, money(value)]) : [['Sem dados suficientes', '-']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 2.3, textColor: COLORS.navy, lineColor: COLORS.border, lineWidth: .15 },
    headStyles: { fillColor: COLORS.blueSoft, textColor: COLORS.navy, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
    tableWidth: pageWidth - 28
  });
  return doc.lastAutoTable?.finalY || startY + 20;
}

function status(entry) {
  if (entry.entry_status === 'cancelled') return 'Cancelada';
  if (entry.entry_status === 'adjustment') return entry.adjustment_kind === 'negative' ? 'Estorno / reembolso' : 'Ajuste positivo';
  return 'Ativa';
}

export async function generateBasicControlPdf({ company, month, revenueMode, expenseMode, entries }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableModule.autoTable || autoTableModule.default;
  if (typeof autoTable !== 'function') throw new Error('Não foi possível carregar o gerador de tabelas do PDF.');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 28;
  const current = entries.filter(entry => entry.month === month);
  const revenues = current.filter(entry => entry.type === 'revenue');
  const expenses = current.filter(entry => entry.type === 'expense');
  const revenue = revenueNet(revenues);
  const expense = expenseNet(expenses);
  const result = revenue - expense;
  const margin = revenue > 0 ? result / revenue * 100 : null;
  const previous = previousMonth(month);
  const previousRevenue = revenueNet(entries.filter(entry => entry.month === previous && entry.type === 'revenue'));
  const previousExpense = expenseNet(entries.filter(entry => entry.month === previous && entry.type === 'expense'));
  const previousResult = previousRevenue - previousExpense;
  const resultChange = previousResult !== 0 ? (result - previousResult) / Math.abs(previousResult) * 100 : null;

  const months = [...new Set(entries.map(entry => entry.month).filter(Boolean))].sort().slice(-12);
  const monthly = months.map(key => {
    const monthEntries = entries.filter(entry => entry.month === key);
    const r = revenueNet(monthEntries.filter(entry => entry.type === 'revenue'));
    const e = expenseNet(monthEntries.filter(entry => entry.type === 'expense'));
    return { key, revenue: r, expense: e, result: r - e };
  });

  header(doc, { company, month, revenueMode, expenseMode, pageWidth });
  card(doc, 14, 35, contentWidth, 16, COLORS.blueSoft, COLORS.blueSoft);
  setText(doc, COLORS.navy, 8, 'bold');
  doc.text('Como interpretar', 18, 41);
  setText(doc, COLORS.secondary, 7.2, 'normal');
  doc.text(doc.splitTextToSize('Faturamento representa vendas e serviços informados. Despesas representam gastos do negócio referentes ao período. Resultado e margem são gerenciais; não correspondem automaticamente a lucro contábil, saldo bancário ou base tributária.', contentWidth - 8), 18, 46);

  const gap = 3;
  const width = (contentWidth - gap * 3) / 4;
  kpi(doc, 14, 56, width, 'Faturamento após ajustes', money(revenue), `${revenues.filter(e => e.entry_status === 'active').length} lançamentos ativos`, 'blue');
  kpi(doc, 14 + width + gap, 56, width, 'Despesas após ajustes', money(expense), `${expenses.filter(e => e.entry_status === 'active').length} lançamentos ativos`, 'danger');
  kpi(doc, 14 + (width + gap) * 2, 56, width, 'Resultado gerencial', money(result), resultChange === null ? 'Sem base comparável' : `${resultChange >= 0 ? '+' : ''}${percent(resultChange)} vs. mês anterior`, result >= 0 ? 'success' : 'danger');
  kpi(doc, 14 + (width + gap) * 3, 56, width, 'Margem gerencial', margin === null ? '-' : percent(margin), 'Resultado ÷ faturamento', margin !== null && margin >= 0 ? 'success' : 'danger');

  evolution(doc, monthly, 14, 86, contentWidth);

  let y = 149;
  const activeExpenses = expenses.filter(entry => entry.entry_status === 'active');
  if (expenseMode === 'individual') {
    y = summaryTable(autoTable, doc, 'Despesas por categoria', group(activeExpenses, entry => entry.category?.name), y, pageWidth) + 8;
    if (y > pageHeight - 45) { doc.addPage(); y = 24; }
    y = summaryTable(autoTable, doc, 'Despesas por fornecedor', group(activeExpenses, entry => entry.supplier?.name), y, pageWidth) + 8;
    if (y > pageHeight - 45) { doc.addPage(); y = 24; }
    y = summaryTable(autoTable, doc, 'Despesas por meio de pagamento', group(activeExpenses, entry => entry.paymentMethod?.name), y, pageWidth) + 8;
  }

  if (y > pageHeight - 55) { doc.addPage(); y = 24; }
  setText(doc, COLORS.navy, 10, 'bold');
  doc.text('Lançamentos de despesas do período', 14, y);
  autoTable(doc, {
    startY: y + 3,
    margin: { left: 14, right: 14, bottom: 18 },
    head: [['Data', 'Descrição', 'Fornecedor', 'Categoria', 'Pagamento', 'Status', 'Valor']],
    body: expenses.length ? expenses.sort((a, b) => String(a.date).localeCompare(String(b.date))).map(entry => [
      formatDate(entry.date),
      entry.description || (entry.mode === 'monthly' ? 'Total de despesas do mês' : 'Despesa'),
      entry.supplier?.name || 'Fornecedor não informado',
      entry.category?.name || '-',
      entry.paymentMethod?.name || '-',
      status(entry),
      `${entry.entry_status === 'adjustment' && entry.adjustment_kind === 'negative' ? '- ' : entry.entry_status === 'adjustment' && entry.adjustment_kind === 'positive' ? '+ ' : ''}${money(entry.amount)}`
    ]) : [['-', 'Sem despesas registradas', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 2, textColor: COLORS.navy, lineColor: COLORS.border, lineWidth: .12, overflow: 'linebreak' },
    headStyles: { fillColor: COLORS.blueSoft, textColor: COLORS.navy, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 65 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 }, 4: { cellWidth: 32 }, 5: { cellWidth: 31 }, 6: { halign: 'right', cellWidth: 32 } },
    didDrawPage: data => {
      if (data.pageNumber > 1) header(doc, { company, month, revenueMode, expenseMode, pageWidth });
    }
  });

  doc.addPage();
  header(doc, { company, month, revenueMode, expenseMode, pageWidth });
  setText(doc, COLORS.navy, 10, 'bold');
  doc.text('Receitas do período', 14, 39);
  autoTable(doc, {
    startY: 42,
    margin: { left: 14, right: 14, bottom: 18 },
    head: [['Data', 'Descrição', 'Cliente', 'Categoria', 'Pagamento', 'Status', 'Valor']],
    body: revenues.length ? revenues.sort((a, b) => String(a.date).localeCompare(String(b.date))).map(entry => [
      formatDate(entry.date),
      entry.description || (entry.mode === 'monthly' ? 'Faturamento do mês' : 'Receita'),
      entry.customer?.name || 'Consumidor final',
      entry.category?.name || '-',
      entry.paymentMethod?.name || '-',
      status(entry),
      `${entry.entry_status === 'adjustment' && entry.adjustment_kind === 'negative' ? '- ' : entry.entry_status === 'adjustment' && entry.adjustment_kind === 'positive' ? '+ ' : ''}${money(entry.amount)}`
    ]) : [['-', 'Sem receitas registradas', '-', '-', '-', '-', '-']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.8, cellPadding: 2, textColor: COLORS.navy, lineColor: COLORS.border, lineWidth: .12, overflow: 'linebreak' },
    headStyles: { fillColor: COLORS.blueSoft, textColor: COLORS.navy, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 65 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 }, 4: { cellWidth: 32 }, 5: { cellWidth: 31 }, 6: { halign: 'right', cellWidth: 32 } },
    didDrawPage: data => {
      if (data.pageNumber > 1) header(doc, { company, month, revenueMode, expenseMode, pageWidth });
    }
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    footer(doc, pageWidth, pageHeight);
  }

  doc.save(`relatorio-controle-basico-${slug(company?.name)}-${month}.pdf`);
}
