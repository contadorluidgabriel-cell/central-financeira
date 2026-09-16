import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOfxText, parseOfxFile } from '../lib/ofx-parser.js';

const head = '<OFX><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>001<ACCTID>000123-4</BANKACCTFROM><BANKTRANLIST>';
const tail = '</BANKTRANLIST></STMTRS></OFX>';
const item = (fitid, amount = '12.30', date = '20260915', label = 'Pix') => `<STMTTRN><DTPOSTED>${date}<TRNAMT>${amount}<FITID>${fitid}<NAME>${label}</STMTTRN>`;

test('OFX 1.x SGML reads positive and negative amounts and bank account', () => {
  const parsed = parseOfxText(head + item('bank-1') + item('bank-2', '-3.02', '20260916') + tail);
  assert.equal(parsed.bankRef, 'BANK:001:000123-4');
  assert.deepEqual(parsed.rows.map(r => [r.postedOn, r.amount]), [['2026-09-15', '12.30'], ['2026-09-16', '-3.02']]);
});

test('OFX 2.x XML decodes entities and credit card account', () => {
  const parsed = parseOfxText('<OFX><CURDEF>BRL</CURDEF><CCACCTFROM><ACCTID>9876</ACCTID></CCACCTFROM><BANKTRANLIST>' + '<STMTTRN><DTPOSTED>20260915000000[-3:BRT]</DTPOSTED><TRNAMT>-27.59</TRNAMT><FITID>cc-1</FITID><NAME>Mercado &amp; Cia</NAME></STMTTRN>' + tail);
  assert.equal(parsed.bankRef, 'CARD:9876');
  assert.equal(parsed.rows[0].description, 'Mercado & Cia');
});

test('duplicate FITID inside same file is invalid', () => {
  const parsed = parseOfxText(head + item('same') + item('same') + tail);
  assert.equal(parsed.rows[0].errors.length, 0);
  assert.ok(parsed.rows[1].errors.some(e => e.includes('repetido')));
});

test('missing FITID, invalid date and invalid amount are rejected per row', () => {
  const parsed = parseOfxText(head + item('', '9.99', '20260230') + item('x', '2,50') + tail);
  assert.ok(parsed.rows[0].errors.length >= 2);
  assert.ok(parsed.rows[1].errors.some(e => e.includes('Valor')));
});

test('non-BRL currency and missing account are rejected', () => {
  assert.throws(() => parseOfxText((head + item('a') + tail).replace('<CURDEF>BRL', '<CURDEF>USD')), /Moeda USD/);
  assert.throws(() => parseOfxText('<OFX><BANKTRANLIST>' + item('a') + tail), /ACCTID/);
});

test('oversized number of movements is rejected', () => {
  assert.throws(() => parseOfxText(head + Array.from({ length: 501 }, (_, i) => item(`id-${i}`)).join('') + tail), /500/);
});

test('file reader handles Windows-1252 bank exports locally', async () => {
  const value = head + item('latin-1', '5.00', '20260915', 'Caf\u00e9') + tail;
  const bytes = Uint8Array.from([...value].map(ch => ch.charCodeAt(0)));
  const file = new File([bytes], 'extrato.ofx');
  const parsed = await parseOfxFile(file);
  assert.equal(parsed.rows[0].description, 'Caf\u00e9');
  assert.equal(parsed.fileName, 'extrato.ofx');
});
