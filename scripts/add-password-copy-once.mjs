import fs from 'node:fs';
const path = 'components/CentralFinanceiraV2.jsx';
let source = fs.readFileSync(path, 'utf8');
function replaceOnce(before, after) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) throw new Error('Expected a unique access form section');
  source = source.slice(0, first) + after + source.slice(first + before.length);
}
replaceOnce('      const copyMessage = async () => {', `      const copyPassword = async () => {
        if (!accessResult?.temporaryPassword) return;
        try {
          await navigator.clipboard.writeText(accessResult.temporaryPassword);
          setToast('Senha provisória copiada.');
        } catch {
          setToast('Não foi possível copiar automaticamente. Selecione o campo da senha para copiar.');
        }
      };

      const copyMessage = async () => {`);
replaceOnce('<button type="button" className="btn btn-primary" onClick={copyMessage}><Icon name="file"/>Copiar mensagem para o cliente</button>', `<div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" className="btn btn-secondary" onClick={copyPassword}><Icon name="lock"/>Copiar só a senha</button><button type="button" className="btn btn-primary" onClick={copyMessage}><Icon name="file"/>Copiar mensagem para o cliente</button></div>`);
fs.writeFileSync(path, source);
console.log('Added a copy-only-password action to access creation and reset results.');
