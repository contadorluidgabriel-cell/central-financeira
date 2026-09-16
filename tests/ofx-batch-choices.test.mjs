import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareOfxBatch } from '../lib/ofx-batch-choices.mjs';

const row = (id, amount, description, posted_at = null) => ({ id, amount, description, posted_at });

test('prepares ordinary inflows and outflows without posting or category guesses', () => {
  const result = prepareOfxBatch([row('a', 150, 'Venda balcão'), row('b', -20, 'Internet')], 'basic');
  assert.equal(result.prepared, 2);
  assert.deepEqual(result.choices.a, { entryType: 'revenue', categoryId: '', description: 'Venda balcão' });
  assert.deepEqual(result.choices.b, { entryType: 'expense', categoryId: '', description: 'Internet' });
});

test('excludes ambiguous, already posted and unsupported simple-control outflows', () => {
  const result = prepareOfxBatch([row('a', 200, 'Transferência recebida'), row('b', -20, 'Internet'), row('c', 50, 'Venda', '2026-09-16')], 'simple');
  assert.equal(result.prepared, 0);
  assert.equal(result.flagged, 1);
  assert.equal(result.unsupported, 1);
});

test('caps batch to 100 and exposes remaining eligible entries', () => {
  const result = prepareOfxBatch(Array.from({ length: 105 }, (_, i) => row(String(i), i % 2 ? -10 : 10, `Movimento ${i}`)), 'complete');
  assert.equal(result.prepared, 100);
  assert.equal(result.remaining, 5);
});

test('skips bank movements without a valid amount or description', () => {
  const result = prepareOfxBatch([row('a', 0, 'Zero'), row('b', 42, ''), row('c', 30, 'Pagamento fatura do cartão')], 'basic');
  assert.equal(result.prepared, 0);
  assert.equal(result.unsupported, 2);
  assert.equal(result.flagged, 1);
});
