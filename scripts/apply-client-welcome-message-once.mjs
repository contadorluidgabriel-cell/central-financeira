import fs from 'node:fs';

const file = 'components/CentralFinanceiraV2.jsx';
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(previous, next, description) {
  const first = source.indexOf(previous);
  if (first < 0 || source.indexOf(previous, first + previous.length) >= 0) {
    throw new Error(`Expected one exact match for ${description}`);
  }
  source = source.replace(previous, next);
}

const start = '      const copyCredentials = async () => {';
const end = '\n\n      const createAccess = async () => {';
const startAt = source.indexOf(start);
const endAt = source.indexOf(end, startAt);
if (startAt < 0 || endAt < 0 || source.indexOf(start, startAt + start.length) >= 0) {
  throw new Error('Could not locate the unique access copy handler');
}
const replacement = [
  '      const welcomeMessage = accessResult?.temporaryPassword',
  '        ? `Olá! Seu acesso à Central Financeira está pronto.\\n\\nEmpresa: ${c.name}\\nAcesse: https://centralfinanceira-peach.vercel.app/\\nE-mail: ${accessResult.email}\\nSenha provisória: ${accessResult.temporaryPassword}\\n\\nNo primeiro acesso, entre com a senha provisória e crie sua senha pessoal.\\nSe precisar de ajuda, me chame por aqui.\\n\\nContador Luid Gabriel`',
  "        : '';",
  '',
  '      const copyMessage = async () => {',
  '        if (!welcomeMessage) return;',
  '        try {',
  '          await navigator.clipboard.writeText(welcomeMessage);',
  "          setToast('Mensagem de acesso copiada.');",
  '        } catch {',
  "          setToast('Não foi possível copiar automaticamente. Selecione o texto da mensagem para copiar.');",
  '        }',
  '      };'
].join('\n');
source = source.slice(0, startAt) + replacement + source.slice(endAt);

replaceOnce(
  '<div className={styles.modalHint}><b>Senha provisória criada.</b> Ela é mostrada somente agora. Copie as credenciais e envie ao cliente pelo seu canal habitual.</div>',
  '<div className={styles.modalHint}><b>Acesso preparado.</b> Confira e copie a mensagem abaixo. A senha provisória é mostrada somente nesta etapa, inclusive após uma redefinição.</div>',
  'access completion explanation'
);

replaceOnce(
  '<button type="button" className="btn btn-primary" onClick={copyCredentials}>Copiar credenciais</button>',
  '<div className="field full"><label htmlFor="client-access-message">Mensagem pronta para enviar</label><textarea id="client-access-message" className="textarea" readOnly value={welcomeMessage} rows={11} onFocus={event=>event.currentTarget.select()} style={{width:"100%",fontSize:14,lineHeight:1.6,resize:"vertical"}}/></div>\n            <button type="button" className="btn btn-primary" onClick={copyMessage}><Icon name="file"/>Copiar mensagem para o cliente</button>\n            <div className={styles.modalHint}>A mensagem inclui uma senha provisória. Confira o destinatário e envie por um canal privado; ao fechar esta tela, a senha deixa de ser exibida.</div>',
  'preview and copy action'
);

replaceOnce(
  'A senha provisória usa o CNPJ/CPF somente com números. Se não houver documento cadastrado, o sistema gera uma alternativa temporária. No primeiro login, o cliente será obrigado a criar a própria senha.',
  'O sistema gera uma senha provisória aleatória. Ela aparece uma única vez após a criação do acesso; no primeiro login, o cliente deverá criar sua senha pessoal.',
  'outdated provisional password guidance'
);

fs.writeFileSync(file, source);
console.log('Client welcome message and one-time credential preview applied.');
