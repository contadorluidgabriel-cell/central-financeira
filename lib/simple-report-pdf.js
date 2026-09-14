'use client';

const COLORS = {
  blue: [36, 86, 232],
  blueSoft: [238, 243, 255],
  navy: [24, 34, 48],
  secondary: [102, 112, 133],
  bg: [246, 248, 252],
  border: [228, 233, 241],
  success: [22, 131, 74],
  warning: [161, 92, 7],
  danger: [180, 35, 24],
  white: [255, 255, 255]
};

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const monthLabel = key => {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || 'Período não informado';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, char => char.toUpperCase());
};
const shortMonth = key => {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || '';
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
};
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-';
const slug = value => String(value || 'empresa').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';
const modeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada receita' })[mode] || mode;
const sum = values => values.reduce((total, value) => total + Number(value || 0), 0);
const grossBilling = entries => sum(entries.filter(entry => entry.entry_status === 'active').map(entry => entry.amount));
const adjustments = (entries, kind) => sum(entries.filter(entry => entry.entry_status === 'adjustment' && entry.adjustment_kind === kind).map(entry => entry.amount));
const netBilling = entries => grossBilling(entries) + adjustments(entries, 'positive') - adjustments(entries, 'negative');
const previousMonth = key => {
  const [year, month] = String(key).split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const nowMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const dayOf = value => Number(String(value || '').slice(8, 10) || 0);

function groupByAmount(items, getKey) {
  return [...items.reduce((map, item) => {
    const key = getKey(item) || 'Não informado';
    map.set(key, (map.get(key) || 0) + Number(item.amount || 0));
    return map;
  }, new Map()).entries()].sort((a, b) => b[1] - a[1]);
}

function statusLabel(entry) {
  if (entry.entry_status === 'cancelled') return 'Cancelada';
  if (entry.entry_status === 'adjustment') return entry.adjustment_kind === 'negative' ? 'Estorno' : 'Ajuste positivo';
  return 'Ativa';
}

function contextualMetrics(mode, activeEntries) {
  if (mode === 'daily') {
    const grouped = groupByAmount(activeEntries, entry => String(entry.date || '').slice(0, 10));
    const best = grouped[0];
    return [
      ['Dias com movimento', String(grouped.length)],
      ['Média por dia', money(grouped.length ? grossBilling(activeEntries) / grouped.length : 0)],
      ['Melhor dia', best ? `${formatDate(best[0])} - ${money(best[1])}` : '-']
    ];
  }
  if (mode === 'individual') {
    const customers = groupByAmount(activeEntries, entry => entry.customer?.name || 'Consumidor final');
    const categories = groupByAmount(activeEntries, entry => entry.category?.name || 'Não informado');
    return [
      ['Receitas registradas', String(activeEntries.length)],
      ['Ticket médio', money(activeEntries.length ? grossBilling(activeEntries) / activeEntries.length : 0)],
      ['Principal cliente', customers[0] ? `${customers[0][0]} - ${money(customers[0][1])}` : '-'],
      ['Principal categoria', categories[0] ? `${categories[0][0]} - ${money(categories[0][1])}` : '-']
    ];
  }
  return [
    ['Modo de registro', 'Total consolidado do mês'],
    ['Lançamentos ativos', String(activeEntries.length)]
  ];
}

function comparePrevious(entries, month, mode) {
  const previous = previousMonth(month);
  let previousEntries = entries.filter(entry => entry.month === previous);
  const currentEntries = entries.filter(entry => entry.month === month);
  if (mode !== 'monthly' && month === nowMonth()) {
    const today = new Date().getDate();
    previousEntries = previousEntries.filter(entry => !entry.date || dayOf(entry.date) <= today);
  }
  const currentValue = netBilling(currentEntries);
  const previousValue = netBilling(previousEntries);
  const change = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : null;
  return { previous, previousValue, currentValue, change };
}

function setText(doc, color = COLORS.navy, size = 10, style = 'normal') {
  doc.setTextColor(...color);
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

function roundedCard(doc, x, y, width, height, fill = COLORS.white, stroke = COLORS.border) {
  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.roundedRect(x, y, width, height, 2.5, 2.5, 'FD');
}

function drawHeader(doc, { company, month, mode, pageWidth }) {
  doc.setFillColor(...COLORS.blue);
  doc.roundedRect(14, 12, 13, 13, 2.4, 2.4, 'F');
  setText(doc, COLORS.white, 9.5, 'bold');
  doc.text('LG', 20.5, 20.6, { align: 'center' });

  setText(doc, COLORS.navy, 15, 'bold');
  doc.text('Relatório de Faturamento', 32, 17.5);
  setText(doc, COLORS.secondary, 8.5, 'normal');
  doc.text('Central Financeira - Contador Luid Gabriel', 32, 23);

  setText(doc, COLORS.navy, 9.5, 'bold');
  doc.text(company?.name || 'Empresa', pageWidth - 14, 16.5, { align: 'right' });
  setText(doc, COLORS.secondary, 8, 'normal');
  const documentLine = company?.document ? `CNPJ/CPF: ${company.document}` : 'Documento não informado';
  doc.text(documentLine, pageWidth - 14, 21.2, { align: 'right' });
  doc.text(`${monthLabel(month)} | ${modeName(mode)}`, pageWidth - 14, 25.4, { align: 'right' });

  doc.setDrawColor(...COLORS.border);
  doc.line(14, 30, pageWidth - 14, 30);
}

function drawFooter(doc, pageWidth, pageHeight) {
  const page = doc.internal.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();
  doc.setDrawColor(...COLORS.border);
  doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);
  setText(doc, COLORS.secondary, 7.5, 'normal');
  doc.text('Central Financeira - relatório gerencial baseado nos dados informados pelo cliente.', 14, pageHeight - 7.5);
  doc.text(`Página ${page} de ${total}`, pageWidth - 14, pageHeight - 7.5, { align: 'right' });
}

function drawKpi(doc, x, y, width, label, value, detail, tone = 'default') {
  const fill = tone === 'blue' ? COLORS.blueSoft : COLORS.white;
  roundedCard(doc, x, y, width, 24, fill);
  setText(doc, COLORS.secondary, 7.6, 'bold');
  doc.text(label.toUpperCase(), x + 4, y + 6.2);
  setText(doc, tone === 'danger' ? COLORS.danger : tone === 'success' ? COLORS.success : COLORS.navy, 13, 'bold');
  doc.text(String(value), x + 4, y + 14.3, { maxWidth: width - 8 });
  setText(doc, COLORS.secondary, 7.2, 'normal');
  doc.text(String(detail || ''), x + 4, y + 20.2, { maxWidth: width - 8 });
}

function drawContextMetrics(doc, metrics, x, y, width) {
  const count = metrics.length;
  const gap = 3;
  const cardWidth = (width - gap * (count - 1)) / count;
  metrics.forEach(([label, value], index) => {
    const cardX = x + index * (cardWidth + gap);
    roundedCard(doc, cardX, y, cardWidth, 18, COLORS.bg);
    setText(doc, COLORS.secondary, 7, 'bold');
    doc.text(label.toUpperCase(), cardX + 3, y + 5.5, { maxWidth: cardWidth - 6 });
    setText(doc, COLORS.navy, 8.8, 'bold');
    const lines = doc.splitTextToSize(String(value), cardWidth - 6).slice(0, 2);
    doc.text(lines, cardX + 3, y + 11.2);
  });
}

function drawEvolution(doc, monthly, x, y, width) {
  roundedCard(doc, x, y, width, 51, COLORS.white);
  setText(doc, COLORS.navy, 9.5, 'bold');
  doc.text('Evolução do faturamento após ajustes', x + 4, y + 7);
  setText(doc, COLORS.secondary, 7.2, 'normal');
  doc.text('Últimos períodos com dados registrados', x + 4, y + 11.4);

  if (!monthly.length) {
    setText(doc, COLORS.secondary, 8.5, 'normal');
    doc.text('Sem dados suficientes para montar a evolução.', x + 4, y + 30);
    return;
  }

  const chartX = x + 5;
  const chartY = y + 18;
  const chartHeight = 22;
  const chartWidth = width - 10;
  const gap = 2.2;
  const barWidth = Math.max(4, (chartWidth - gap * (monthly.length - 1)) / monthly.length);
  const max = Math.max(1, ...monthly.map(item => Number(item.value || 0)));

  monthly.forEach((item, index) => {
    const height = Math.max(1.5, (Number(item.value || 0) / max) * chartHeight);
    const barX = chartX + index * (barWidth + gap);
    doc.setFillColor(...COLORS.blueSoft);
    doc.roundedRect(barX, chartY + chartHeight - height, barWidth, height, 1, 1, 'F');
    doc.setFillColor(...COLORS.blue);
    doc.roundedRect(barX, chartY + chartHeight - height, barWidth, Math.min(2.2, height), 1, 1, 'F');
    setText(doc, COLORS.secondary, 6.2, 'normal');
    doc.text(shortMonth(item.key), barX + barWidth / 2, chartY + chartHeight + 5, { align: 'center' });
  });
}

function breakdownTable(autoTable, doc, title, rows, startY, pageWidth) {
  setText(doc, COLORS.navy, 9.5, 'bold');
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    margin: { left: 14, right: 14, bottom: 18 },
    head: [['Descrição', 'Faturamento']],
    body: rows.length ? rows.slice(0, 8).map(([label, value]) => [label, money(value)]) : [['Sem dados suficientes', '-']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 2.3, textColor: COLORS.navy, lineColor: COLORS.border, lineWidth: 0.15 },
    headStyles: { fillColor: COLORS.blueSoft, textColor: COLORS.navy, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 38 } },
    tableWidth: pageWidth - 28
  });
  return doc.lastAutoTable?.finalY || startY + 20;
}

export async function generateSimpleRevenuePdf({ company, month, mode, entries }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const autoTable = autoTableModule.autoTable || autoTableModule.default;
  if (typeof autoTable !== 'function') throw new Error('Não foi possível carregar o gerador de tabelas do PDF.');

  const orientation = mode === 'individual' ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 28;
  const currentEntries = entries.filter(entry => entry.month === month);
  const activeEntries = currentEntries.filter(entry => entry.entry_status === 'active');
  const gross = grossBilling(currentEntries);
  const positive = adjustments(currentEntries, 'positive');
  const negative = adjustments(currentEntries, 'negative');
  const net = netBilling(currentEntries);
  const comparison = comparePrevious(entries, month, mode);
  const changeLabel = comparison.change === null
    ? 'Sem base comparável no período anterior'
    : `${comparison.change >= 0 ? '+' : ''}${comparison.change.toFixed(1).replace('.', ',')}% vs. ${monthLabel(comparison.previous).toLowerCase()}`;

  const monthly = [...new Set(entries.map(entry => entry.month).filter(Boolean))]
    .sort()
    .slice(-12)
    .map(key => ({ key, value: netBilling(entries.filter(entry => entry.month === key)) }));

  drawHeader(doc, { company, month, mode, pageWidth });

  roundedCard(doc, 14, 35, contentWidth, 17, COLORS.blueSoft, COLORS.blueSoft);
  setText(doc, COLORS.navy, 8.3, 'bold');
  doc.text('Leitura correta do relatório', 18, 41.2);
  setText(doc, COLORS.secondary, 7.5, 'normal');
  const note = 'Os valores representam faturamento informado de vendas e serviços. Não representam saldo bancário e este documento não substitui notas fiscais, escrituração contábil ou apuração tributária.';
  doc.text(doc.splitTextToSize(note, contentWidth - 8), 18, 46.2);

  const gap = 3;
  const kpiWidth = (contentWidth - gap * 3) / 4;
  const kpiY = 57;
  drawKpi(doc, 14, kpiY, kpiWidth, 'Faturamento bruto', money(gross), `${activeEntries.length} ${activeEntries.length === 1 ? 'lançamento ativo' : 'lançamentos ativos'}`, 'blue');
  drawKpi(doc, 14 + (kpiWidth + gap), kpiY, kpiWidth, 'Ajustes positivos', money(positive), 'Acréscimos registrados no período', positive > 0 ? 'success' : 'default');
  drawKpi(doc, 14 + (kpiWidth + gap) * 2, kpiY, kpiWidth, 'Estornos / ajustes', money(negative), 'Reduções registradas no período', negative > 0 ? 'danger' : 'default');
  drawKpi(doc, 14 + (kpiWidth + gap) * 3, kpiY, kpiWidth, 'Após ajustes', money(net), changeLabel, net >= 0 ? 'success' : 'danger');

  const metrics = contextualMetrics(mode, activeEntries);
  drawContextMetrics(doc, metrics, 14, 85, contentWidth);
  drawEvolution(doc, monthly, 14, 108, contentWidth);

  let cursorY = 165;
  if (mode === 'individual') {
    const customerRows = groupByAmount(activeEntries, entry => entry.customer?.name || 'Consumidor final');
    const categoryRows = groupByAmount(activeEntries, entry => entry.category?.name || 'Não informado');
    const paymentRows = groupByAmount(activeEntries, entry => entry.paymentMethod?.name || 'Não informado');
    cursorY = breakdownTable(autoTable, doc, 'Faturamento por cliente', customerRows, cursorY, pageWidth) + 8;
    if (cursorY > pageHeight - 55) { doc.addPage(); cursorY = 22; }
    cursorY = breakdownTable(autoTable, doc, 'Faturamento por categoria', categoryRows, cursorY, pageWidth) + 8;
    if (cursorY > pageHeight - 55) { doc.addPage(); cursorY = 22; }
    cursorY = breakdownTable(autoTable, doc, 'Faturamento por meio de pagamento', paymentRows, cursorY, pageWidth) + 8;
  }

  if (cursorY > pageHeight - 55) {
    doc.addPage();
    cursorY = 22;
  }

  setText(doc, COLORS.navy, 10, 'bold');
  doc.text(`Lançamentos de ${monthLabel(month)}`, 14, cursorY);
  setText(doc, COLORS.secondary, 7.2, 'normal');
  doc.text('Cancelamentos permanecem visíveis para preservar a trilha do período.', 14, cursorY + 4.5);

  const head = mode === 'individual'
    ? [['Data', 'Descrição', 'Cliente', 'Categoria', 'Pagamento', 'Status', 'Valor']]
    : [['Data', 'Descrição', 'Status', 'Valor']];
  const body = [...currentEntries]
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    .map(entry => {
      const signedValue = entry.entry_status === 'adjustment' && entry.adjustment_kind === 'negative' ? -Number(entry.amount || 0) : Number(entry.amount || 0);
      if (mode === 'individual') {
        return [
          formatDate(entry.date),
          entry.description || (entry.entry_status === 'adjustment' ? 'Ajuste de faturamento' : 'Receita'),
          entry.customer?.name || (entry.entry_status === 'active' ? 'Consumidor final' : '-'),
          entry.category?.name || '-',
          entry.paymentMethod?.name || '-',
          statusLabel(entry),
          money(signedValue)
        ];
      }
      return [
        mode === 'monthly' ? monthLabel(month) : formatDate(entry.date),
        entry.description || (mode === 'monthly' ? 'Faturamento do mês' : entry.entry_status === 'adjustment' ? 'Ajuste de faturamento' : 'Receita'),
        statusLabel(entry),
        money(signedValue)
      ];
    });

  autoTable(doc, {
    startY: cursorY + 7,
    margin: { left: 14, right: 14, top: 18, bottom: 18 },
    head,
    body: body.length ? body : [[mode === 'individual' ? '-' : '-', 'Sem lançamentos neste período', ...(mode === 'individual' ? ['-', '-', '-', '-', money(0)] : ['-', money(0)])]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: mode === 'individual' ? 6.7 : 7.8, cellPadding: 2, textColor: COLORS.navy, lineColor: COLORS.border, lineWidth: 0.15, valign: 'middle' },
    headStyles: { fillColor: COLORS.navy, textColor: COLORS.white, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: COLORS.bg },
    columnStyles: mode === 'individual'
      ? { 0: { cellWidth: 23 }, 6: { cellWidth: 30, halign: 'right' } }
      : { 0: { cellWidth: 35 }, 3: { cellWidth: 35, halign: 'right' } },
    didParseCell: data => {
      if (data.section === 'body') {
        const statusIndex = mode === 'individual' ? 5 : 2;
        if (data.column.index === statusIndex && data.cell.raw === 'Cancelada') data.cell.styles.textColor = COLORS.danger;
        if (data.column.index === statusIndex && data.cell.raw === 'Estorno') data.cell.styles.textColor = COLORS.warning;
      }
    }
  });

  const generatedAt = new Date().toLocaleString('pt-BR');
  const finalY = doc.lastAutoTable?.finalY || cursorY + 20;
  if (finalY < pageHeight - 30) {
    setText(doc, COLORS.secondary, 7.2, 'normal');
    doc.text(`Gerado em ${generatedAt}.`, 14, finalY + 7);
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      setText(doc, COLORS.secondary, 7.2, 'normal');
      doc.text(`${company?.name || 'Empresa'} - ${monthLabel(month)}`, 14, 10);
    }
    drawFooter(doc, pageWidth, pageHeight);
  }

  const filename = `relatorio-faturamento-${slug(company?.name)}-${month}.pdf`;
  doc.save(filename);
  return filename;
}
