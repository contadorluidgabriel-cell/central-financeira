'use client';

const normalize = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const digits = value => String(value ?? '').replace(/\D/g, '');
const sameMoney = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;

const ALIASES = {
  month: ['mes', 'competencia', 'periodo'],
  date: ['data', 'data da venda', 'data do servico', 'data venda servico'],
  amount: ['valor', 'valor total', 'valor do dia', 'faturamento', 'total'],
  description: ['descricao', 'observacao', 'observacao do dia', 'historico'],
  category: ['categoria'],
  customer: ['cliente', 'nome do cliente'],
  document: ['cpf cnpj', 'cpf', 'cnpj', 'documento'],
  payment: ['meio de pagamento', 'forma de pagamento', 'pagamento']
};

const TEMPLATE_HEADERS = {
  monthly: ['Mês', 'Valor total', 'Observação'],
  daily: ['Data', 'Valor do dia', 'Observação'],
  individual: ['Data', 'Valor', 'Descrição', 'Categoria', 'Cliente', 'CPF/CNPJ', 'Meio de pagamento']
};

function findColumn(header, key) {
  const normalized = header.map(normalize);
  return normalized.findIndex(item => ALIASES[key].includes(item));
}

function parseMoney(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const clean = String(value ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!clean) return NaN;
  let normalizedValue = clean;
  if (clean.includes(',') && clean.includes('.')) {
    normalizedValue = clean.lastIndexOf(',') > clean.lastIndexOf('.')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  } else if (clean.includes(',')) {
    normalizedValue = clean.replace(/\./g, '').replace(',', '.');
  }
  return Number(normalizedValue);
}

function isoDateParts(year, month, day) {
  if (!year || !month || !day) return null;
  const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${candidate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== candidate) return null;
  return candidate;
}

function parseDate(value, XLSX) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoDateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX?.SSF?.parse_date_code?.(value);
    if (parsed) return isoDateParts(parsed.y, parsed.m, parsed.d);
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return isoDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return isoDateParts(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

function parseMonth(value, XLSX) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX?.SSF?.parse_date_code?.(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (match) return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (match) return `${match[2]}-${String(Number(match[1])).padStart(2, '0')}`;
  const date = parseDate(text, XLSX);
  return date ? date.slice(0, 7) : null;
}

function customerMatch(row, customers) {
  const doc = digits(row.document);
  if (doc) {
    const byDocument = customers.find(item => digits(item.document) === doc);
    if (byDocument) return byDocument;
  }
  const name = normalize(row.customerName);
  return name ? customers.find(item => normalize(item.name) === name) || null : null;
}

function catalogMatch(name, items) {
  const key = normalize(name);
  return key ? items.find(item => normalize(item.name) === key) || null : null;
}

function individualSignature(row) {
  return [row.date || '', Number(row.amount || 0).toFixed(2), normalize(row.description), normalize(row.customerName)].join('|');
}

export async function parseSimpleRevenueImport({ file, mode, month, existingEntries = [], categories = [], customers = [], paymentMethods = [] }) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('A planilha não possui nenhuma aba legível.');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  if (!matrix.length) throw new Error('A planilha está vazia.');

  const header = matrix[0].map(value => String(value ?? '').trim());
  const columns = {
    month: findColumn(header, 'month'),
    date: findColumn(header, 'date'),
    amount: findColumn(header, 'amount'),
    description: findColumn(header, 'description'),
    category: findColumn(header, 'category'),
    customer: findColumn(header, 'customer'),
    document: findColumn(header, 'document'),
    payment: findColumn(header, 'payment')
  };

  if (columns.amount < 0) throw new Error('Não encontrei a coluna de valor. Baixe o modelo e mantenha os títulos da primeira linha.');
  if (mode === 'monthly' && columns.month < 0) throw new Error('Não encontrei a coluna “Mês”.');
  if (mode !== 'monthly' && columns.date < 0) throw new Error('Não encontrei a coluna “Data”.');

  const seenMonthly = new Set();
  const seenDaily = new Set();
  const seenIndividual = new Set();
  const existingIndividual = existingEntries.filter(item => item.entry_status === 'active' && item.mode === 'individual');
  const existingMonthly = existingEntries.some(item => item.entry_status === 'active' && item.mode === 'monthly');
  const existingDaily = new Set(existingEntries.filter(item => item.entry_status === 'active' && item.mode === 'daily').map(item => String(item.date).slice(0, 10)));

  const rows = matrix.slice(1).map((cells, index) => {
    const empty = cells.every(value => String(value ?? '').trim() === '');
    if (empty) return null;
    const row = {
      rowNumber: index + 2,
      month,
      date: null,
      amount: parseMoney(cells[columns.amount]),
      description: columns.description >= 0 ? String(cells[columns.description] ?? '').trim() : '',
      categoryName: columns.category >= 0 ? String(cells[columns.category] ?? '').trim() : '',
      customerName: columns.customer >= 0 ? String(cells[columns.customer] ?? '').trim() : '',
      document: columns.document >= 0 ? String(cells[columns.document] ?? '').trim() : '',
      paymentName: columns.payment >= 0 ? String(cells[columns.payment] ?? '').trim() : '',
      errors: [],
      warnings: [],
      duplicate: false,
      selected: true
    };

    if (!(row.amount > 0)) row.errors.push('Valor inválido ou vazio.');

    if (mode === 'monthly') {
      const parsedMonth = parseMonth(cells[columns.month], XLSX);
      row.month = parsedMonth || '';
      if (!parsedMonth) row.errors.push('Mês inválido. Use AAAA-MM ou MM/AAAA.');
      else if (parsedMonth !== month) row.errors.push(`Esta tela está em ${month}; a linha pertence a ${parsedMonth}.`);
      if (existingMonthly) row.errors.push('Já existe um faturamento mensal ativo neste período.');
      if (parsedMonth && seenMonthly.has(parsedMonth)) row.errors.push('Há mais de uma linha para o mesmo mês no arquivo.');
      if (parsedMonth) seenMonthly.add(parsedMonth);
    } else {
      row.date = parseDate(cells[columns.date], XLSX);
      if (!row.date) row.errors.push('Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD.');
      else if (row.date.slice(0, 7) !== month) row.errors.push(`Esta tela está em ${month}; a linha pertence a ${row.date.slice(0, 7)}.`);
    }

    if (mode === 'daily' && row.date) {
      if (existingDaily.has(row.date)) row.errors.push('Já existe um total diário ativo nesta data.');
      if (seenDaily.has(row.date)) row.errors.push('A data aparece mais de uma vez no arquivo.');
      seenDaily.add(row.date);
    }

    if (mode === 'individual') {
      if (normalize(row.paymentName) === 'a prazo') row.errors.push('“A prazo” não é um meio de pagamento. Informe o meio efetivo ou deixe em branco.');
      if (row.categoryName && !catalogMatch(row.categoryName, categories)) row.warnings.push(`Nova categoria: ${row.categoryName}`);
      if (row.paymentName && !catalogMatch(row.paymentName, paymentMethods)) row.warnings.push(`Novo meio de pagamento: ${row.paymentName}`);
      if (row.customerName && !customerMatch(row, customers)) row.warnings.push(`Novo cliente: ${row.customerName}`);
      const signature = individualSignature(row);
      const existingDuplicate = existingIndividual.some(entry => {
        const entrySignature = individualSignature({
          date: String(entry.date || '').slice(0, 10),
          amount: entry.amount,
          description: entry.description || '',
          customerName: entry.customer?.name || ''
        });
        return signature === entrySignature || (String(entry.date || '').slice(0, 10) === row.date && sameMoney(entry.amount, row.amount) && normalize(entry.description) === normalize(row.description));
      });
      const fileDuplicate = seenIndividual.has(signature);
      if (existingDuplicate || fileDuplicate) {
        row.duplicate = true;
        row.warnings.push(existingDuplicate ? 'Possível duplicidade com uma receita já cadastrada.' : 'Possível duplicidade dentro do arquivo.');
        row.selected = false;
      }
      seenIndividual.add(signature);
    }

    if (row.errors.length) row.selected = false;
    return row;
  }).filter(Boolean);

  if (!rows.length) throw new Error('Não encontrei linhas de dados abaixo do cabeçalho.');

  const newCategories = [...new Set(rows.filter(row => !row.errors.length && row.categoryName && !catalogMatch(row.categoryName, categories)).map(row => row.categoryName))];
  const newPayments = [...new Set(rows.filter(row => !row.errors.length && row.paymentName && !catalogMatch(row.paymentName, paymentMethods)).map(row => row.paymentName))];
  const newCustomers = rows.filter(row => !row.errors.length && row.customerName && !customerMatch(row, customers)).reduce((list, row) => {
    const key = digits(row.document) || normalize(row.customerName);
    if (!list.some(item => item.key === key)) list.push({ key, name: row.customerName, document: row.document || '' });
    return list;
  }, []).map(({ name, document }) => ({ name, document }));

  return { fileName: file.name, rows, newCategories, newPayments, newCustomers };
}

export function simpleImportTemplate(mode) {
  return TEMPLATE_HEADERS[mode] || TEMPLATE_HEADERS.individual;
}

export function downloadSimpleImportTemplate(mode, month) {
  const header = simpleImportTemplate(mode);
  const example = mode === 'monthly'
    ? [month, '', 'Exemplo — preencha o valor ou apague esta linha']
    : mode === 'daily'
      ? [`01/${month.slice(5, 7)}/${month.slice(0, 4)}`, '', 'Exemplo — preencha o valor ou apague esta linha']
      : [`01/${month.slice(5, 7)}/${month.slice(0, 4)}`, '', 'Exemplo — preencha o valor ou apague esta linha', 'Prestação de serviços', 'Cliente exemplo', '', 'Pix'];
  const csv = [header, example].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `modelo-controle-simples-${mode}-${month}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function selectedImportCatalogs(rows, categories = [], customers = [], paymentMethods = []) {
  const selected = rows.filter(row => row.selected && !row.errors.length);
  const newCategories = [...new Set(selected.filter(row => row.categoryName && !catalogMatch(row.categoryName, categories)).map(row => row.categoryName))];
  const newPayments = [...new Set(selected.filter(row => row.paymentName && !catalogMatch(row.paymentName, paymentMethods)).map(row => row.paymentName))];
  const newCustomers = selected.filter(row => row.customerName && !customerMatch(row, customers)).reduce((list, row) => {
    const key = digits(row.document) || normalize(row.customerName);
    if (!list.some(item => item.key === key)) list.push({ key, name: row.customerName, document: row.document || '' });
    return list;
  }, []).map(({ name, document }) => ({ name, document }));
  return { newCategories, newPayments, newCustomers };
}
