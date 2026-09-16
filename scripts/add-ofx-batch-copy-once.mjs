import fs from 'node:fs';
function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + before.length) !== -1) throw new Error('Expected unique batch text in ' + path);
  fs.writeFileSync(path, source.slice(0, at) + after + source.slice(at + before.length));
}
replaceOnce('components/ImportCenter.jsx', 'Selecione cada movimento, escolha receita ou despesa e confirme. Verifique lançamentos manuais para evitar duplicidades.', 'Prepare até 100 movimentos em lote ou escolha individualmente, confira os valores e confirme. Movimentos manuais anteriores exigem atenção para evitar duplicidades.');
replaceOnce('package.json', 'node --test tests/ofx-parser.test.mjs tests/ofx-posting-payload.test.mjs', 'node --test tests/ofx-parser.test.mjs tests/ofx-posting-payload.test.mjs tests/ofx-batch-choices.test.mjs');
console.log('Import guidance and batch test command updated.');
