import fs from 'node:fs';

function replaceExactlyOnce(file, before, after, label) {
  const content = fs.readFileSync(file, 'utf8');
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one ${label} match; found ${count}`);
  fs.writeFileSync(file, content.replace(before, after));
}

const file = 'components/OfxEntryPostingLauncher.jsx';
replaceExactlyOnce(file,
  "import styles from './OfxEntryPostingLauncher.module.css';",
  "import { buildOfxPostingPayload, explainOfxPostingError } from '../lib/ofx-posting-payload.mjs';\nimport styles from './OfxEntryPostingLauncher.module.css';",
  'helper import');
replaceExactlyOnce(file,
  `      const pItems = selected.map(item => ({
        transactionId: item.id,
        entryType: choices[item.id].entryType,
        categoryId: choices[item.id].categoryId || null,
        description: (choices[item.id].description ?? item.description).trim()
      }));
      if (pItems.some(item => !item.description || item.description.length > 300)) throw new Error('Revise as descrições dos lançamentos selecionados.');`,
  `      const pItems = buildOfxPostingPayload(selected, choices);`,
  'posting payload');
replaceExactlyOnce(file,
  '      if (outcome.error) throw outcome.error;',
  '      if (outcome.error) throw new Error(explainOfxPostingError(outcome.error));',
  'server error handling');
replaceExactlyOnce('package.json',
  '"test:ofx": "node --test tests/ofx-parser.test.mjs"',
  '"test:ofx": "node --test tests/ofx-parser.test.mjs tests/ofx-posting-payload.test.mjs"',
  'test command');
console.log('Guarded OFX payload validation patch applied.');
