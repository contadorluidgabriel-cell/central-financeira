// OFX 1.x (SGML) and OFX 2.x (XML). Parse in the browser; never upload the original file.
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 500;
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = value => String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
  if (entity[0] === '#') {
    const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }
  return entities[entity.toLowerCase()] || '';
});
const tag = (text, name) => {
  const match = String(text || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>\\s*([^<\\r\\n]*)`, 'i'));
  return decode(match?.[1] || '').trim();
};
const block = (text, name) => String(text || '').match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'))?.[1] || '';
function asDate(raw) {
  const date = /^\d{8}/.exec(raw || '')?.[0];
  if (!date) return null;
  const y = Number(date.slice(0, 4)), m = Number(date.slice(4, 6)), d = Number(date.slice(6, 8));
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return null;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
function asAmount(raw) {
  const text = String(raw || '').trim();
  if (!/^[+-]?\d+(?:\.\d{1,6})?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || !value || Math.abs(value) > 999999999.99) return null;
  const cents = Math.round(value * 100);
  if (!cents) return null;
  return (cents / 100).toFixed(2);
}
function accountInfo(text) {
  const bank = block(text, 'BANKACCTFROM');
  const card = block(text, 'CCACCTFROM');
  const account = bank || card;
  const accountId = tag(account, 'ACCTID').replace(/\s+/g, '');
  if (!accountId || accountId.length > 90) throw new Error('O OFX não informa uma conta bancária válida (ACCTID).');
  const bankId = tag(account, 'BANKID').replace(/\s+/g, '');
  const prefix = bank ? `BANK:${bankId || 'SEM-BANCO'}` : 'CARD';
  return { bankRef: `${prefix}:${accountId}`.slice(0, 180), accountLabel: `•••• ${accountId.slice(-4)}`, bankId: bankId || null };
}
export function parseOfxText(text) {
  if (typeof text !== 'string' || text.length > MAX_BYTES * 2) throw new Error('Arquivo OFX muito grande. Limite: 2 MB.');
  if (!/<OFX(?:\s[^>]*)?>/i.test(text)) throw new Error('O arquivo não contém a estrutura OFX esperada.');
  const currency = tag(text, 'CURDEF').toUpperCase();
  if (currency && currency !== 'BRL') throw new Error(`Moeda ${currency} não suportada: importe apenas extratos em reais (BRL).`);
  const account = accountInfo(text);
  const list = block(text, 'BANKTRANLIST') || block(text, 'CCSTMTRS') || text;
  const matches = [...list.matchAll(/<STMTTRN(?:\s[^>]*)?>([\s\S]*?)<\/STMTTRN\s*>/gi)];
  if (!matches.length) throw new Error('Nenhuma movimentação STMTTRN encontrada no OFX.');
  if (matches.length > MAX_ROWS) throw new Error(`O extrato possui mais de ${MAX_ROWS} movimentações. Divida-o por períodos menores.`);
  const seen = new Set();
  const rows = matches.map((match, index) => {
    const content = match[1];
    const fitid = tag(content, 'FITID').slice(0, 180);
    const postedOn = asDate(tag(content, 'DTPOSTED'));
    const amount = asAmount(tag(content, 'TRNAMT'));
    const name = tag(content, 'NAME');
    const memo = tag(content, 'MEMO');
    const description = [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' — ').slice(0, 300) || 'Movimentação bancária';
    const transactionType = tag(content, 'TRNTYPE').slice(0, 24);
    const errors = [];
    if (!fitid) errors.push('Identificador FITID ausente.');
    if (!postedOn) errors.push('Data DTPOSTED inválida.');
    if (!amount) errors.push('Valor TRNAMT inválido.');
    if (fitid && seen.has(fitid)) errors.push('FITID repetido neste arquivo.');
    if (fitid) seen.add(fitid);
    return { rowNumber: index + 1, fitid, postedOn, amount, description, transactionType, errors };
  });
  return { ...account, currency: currency || 'BRL', currencyAssumed: !currency, rows };
}
export async function parseOfxFile(file) {
  if (!file) throw new Error('Selecione um arquivo OFX.');
  if (!/\.ofx$/i.test(file.name || '')) throw new Error('Selecione um arquivo com extensão .ofx.');
  if (!file.size || file.size > MAX_BYTES) throw new Error('O arquivo deve ter entre 1 byte e 2 MB.');
  const bytes = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder('windows-1252').decode(bytes); }
  return { ...parseOfxText(text), fileName: file.name.slice(0, 120) };
}
