import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfxPostingPayload, explainOfxPostingError } from '../lib/ofx-posting-payload.mjs';

// Entirely synthetic identifiers and descriptions; never use a customer's bank data in tests.
const ID = '11111111-2222-4333-8444-555555555555';
const OTHER = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const row = { id: ID, amount: '-12.50', description: 'Despesa fictícia' };
const choices = { [ID]: { entryType: 'expense', categoryId: '', description: 'Despesa conferida' } };

test('sends exact camelCase keys, UUID and plain JSON-compatible payload', () => {
  const result = buildOfxPostingPayload([row], choices);
  assert.deepEqual(result, [{ transactionId: ID, entryType: 'expense', categoryId: null, description: 'Despesa conferida' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('normalizes UUID whitespace and validates sign', () => {
  assert.equal(buildOfxPostingPayload([{ ...row, id: ` ${ID} ` }], choices)[0].transactionId, ID);
  assert.throws(() => buildOfxPostingPayload([row], { [ID]: { entryType: 'revenue' } }), /tipo de lançamento/);
});

test('blocks missing, malformed, and duplicate identifiers before RPC', () => {
  for (const id of [undefined, null, '', 'FAKE-FITID', '00000000-0000-0000-0000-00000000000Z']) {
    assert.throws(() => buildOfxPostingPayload([{ ...row, id }], choices), /sem identificador válido/);
  }
  assert.throws(() => buildOfxPostingPayload([row, { ...row, id: ID }], choices), /mais de uma vez/);
});

test('does not send unvalidated category or empty description', () => {
  assert.throws(() => buildOfxPostingPayload([row], { [ID]: { entryType: 'expense', categoryId: 'wrong' } }), /categoria/);
  assert.throws(() => buildOfxPostingPayload([row], { [ID]: { entryType: 'expense', description: '  ' } }), /descrições/);
});

test('supports distinct valid movements and distinguishes server-side rejection', () => {
  const rows = [row, { id: OTHER, amount: 5, description: 'Receita fictícia' }];
  const values = buildOfxPostingPayload(rows, { ...choices, [OTHER]: { entryType: 'revenue' } });
  assert.equal(values.length, 2);
  assert.match(explainOfxPostingError(new Error('Identificador de movimentação inválido')), /OFX-ID-SERVER/);
  assert.equal(explainOfxPostingError(new Error('Competência fechada')), 'Competência fechada');
});
