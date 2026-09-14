from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Padrão não encontrado em {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')


def regex_once(path, pattern, replacement):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    text2, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Regex esperava 1 ocorrência em {path}, encontrou {count}: {pattern}')
    p.write_text(text2, encoding='utf-8')


# 1) Senha provisória: CNPJ/CPF somente números; fallback seguro quando documento não existe.
replace_once(
    'lib/client-access.js',
    "function normalizeEmail(value) {\n  return String(value || '').trim().toLowerCase();\n}\n\nexport function generateTemporaryPassword() {\n  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';\n  const bytes = new Uint32Array(12);\n  crypto.getRandomValues(bytes);\n  const body = Array.from(bytes, n => alphabet[n % alphabet.length]).join('');\n  return `A${body}7!`;\n}",
    "function normalizeEmail(value) {\n  return String(value || '').trim().toLowerCase();\n}\n\nfunction digits(value) {\n  return String(value || '').replace(/\\D/g, '');\n}\n\nexport function generateTemporaryPassword(document = '') {\n  const documentPassword = digits(document);\n  if (documentPassword.length >= 8) return documentPassword;\n\n  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';\n  const bytes = new Uint32Array(12);\n  crypto.getRandomValues(bytes);\n  const body = Array.from(bytes, n => alphabet[n % alphabet.length]).join('');\n  return `A${body}7!`;\n}"
)
replace_once(
    'lib/client-access.js',
    "export async function createClientAccess({ organizationId, email, name }) {",
    "export async function createClientAccess({ organizationId, email, name, document = '' }) {"
)
replace_once(
    'lib/client-access.js',
    "  const temporaryPassword = generateTemporaryPassword();\n  const created = await neonTest.auth.admin.createUser({",
    "  const temporaryPassword = generateTemporaryPassword(document);\n  const created = await neonTest.auth.admin.createUser({"
)
replace_once(
    'lib/client-access.js',
    "export async function resetClientPassword({ userId, email }) {\n  if (!userId) throw new Error('Acesso do cliente não encontrado.');\n  const temporaryPassword = generateTemporaryPassword();",
    "export async function resetClientPassword({ userId, email, document = '' }) {\n  if (!userId) throw new Error('Acesso do cliente não encontrado.');\n  const temporaryPassword = generateTemporaryPassword(document);"
)

# 2) Painel administrativo: usa documento na senha e remove a antiga 'personalização' de módulos.
replace_once(
    'components/CentralFinanceiraV2.jsx',
    "()=>createClientAccess({organizationId:c.id,email:accessDraft.email,name:c.name}),",
    "()=>createClientAccess({organizationId:c.id,email:accessDraft.email,name:c.name,document:c.document}),"
)
replace_once(
    'components/CentralFinanceiraV2.jsx',
    "()=>resetClientPassword({userId:access.userId,email:access.email}),",
    "()=>resetClientPassword({userId:access.userId,email:access.email,document:c.document}),"
)
replace_once(
    'components/CentralFinanceiraV2.jsx',
    "<span className=\"help\">O sistema gera uma senha provisória. No primeiro login, o cliente será obrigado a criar a própria senha.</span>",
    "<span className=\"help\">A senha provisória usa o CNPJ/CPF somente com números. Se não houver documento cadastrado, o sistema gera uma alternativa temporária. No primeiro login, o cliente será obrigado a criar a própria senha.</span>"
)
replace_once(
    'components/CentralFinanceiraV2.jsx',
    "companySettings: 'Ajustes'",
    "companySettings: 'Cadastro'"
)
replace_once(
    'components/CentralFinanceiraV2.jsx',
    "['companySettings','settings','Personalizar',true]",
    "['companySettings','settings','Cadastro da empresa',true]"
)

new_company_settings = r'''  function CompanySettings({ c }) {
    return <>
      <PageHeader title="Cadastro da empresa" description="Dados cadastrais e de contato. O cliente escolhe o nível de controle e os modos de receitas e despesas no próprio acesso."/>
      <div className={styles.settingsStack}>
        <section className={styles.settingSection}>
          <div className={styles.settingHeader}><h3>Dados da empresa</h3><p>Identificação usada na Central e na criação do acesso.</p></div>
          <div className={styles.settingBody}>
            <form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await run(()=>updateCompanyMetadata(c,{document:String(f.get('document')||'').trim(),contact:String(f.get('contact')||'').trim()}),'Dados atualizados')}}>
              <div className={styles.formGrid2}>
                <div className="field"><label>CNPJ / CPF</label><input className="input" name="document" defaultValue={c.document==='Não informado'?'':c.document}/><span className="help">Também é usado como senha provisória, somente com números, ao criar ou redefinir o acesso.</span></div>
                <div className="field"><label>E-mail principal</label><input className="input" name="contact" type="email" defaultValue={c.contact||''}/></div>
              </div>
              <button className="btn btn-secondary">Salvar dados</button>
            </form>
          </div>
        </section>
        <section className={styles.settingSection}>
          <div className={styles.settingHeader}><h3>Configuração financeira</h3><p>As escolhas de controle pertencem ao cliente.</p></div>
          <div className={styles.settingBody}>
            <div className={styles.modalHint}><b>Como funciona:</b> o administrador cadastra a empresa e libera o acesso. No primeiro acesso, o cliente escolhe Controle Simples ou Básico, os modos de receitas e despesas e o mês inicial. Essas opções não são definidas neste cadastro.</div>
          </div>
        </section>
      </div>
    </>;
  }
'''
regex_once(
    'components/CentralFinanceiraV2.jsx',
    r"  function CompanySettings\(\{ c \}\) \{.*?\n  \}\n\n  function Workspace\(\{ c \}\) \{",
    new_company_settings + "\n  function Workspace({ c }) {"
)

# 3) Despesas: mesmos três modos de receitas (mês, dia, cada despesa).
replace_once(
    'lib/neon-basic-control.js',
    "export const BASIC_EXPENSE_MODES = ['monthly', 'individual'];",
    "export const BASIC_EXPENSE_MODES = ['monthly', 'daily', 'individual'];"
)
replace_once(
    'lib/neon-basic-control.js',
    "  if (mode === 'individual' && !date) throw new Error('Informe a data da despesa.');",
    "  if (mode !== 'monthly' && !date) throw new Error('Informe a data da despesa.');"
)
replace_once(
    'lib/neon-basic-control.js',
    "  if (mode === 'individual' && cleanRows.some(row => !row.date || String(row.date).slice(0, 7) !== month)) throw new Error('A importação contém data fora do período selecionado.');",
    "  if (mode !== 'monthly' && cleanRows.some(row => !row.date || String(row.date).slice(0, 7) !== month)) throw new Error('A importação contém data fora do período selecionado.');"
)
replace_once(
    'lib/neon-basic-control.js',
    "  const existingResult = await neonTest.from('financial_entries').select('id,mode,entry_status').eq('organization_id', organizationId).eq('competency', competencyDate(month)).eq('type', 'expense');\n  if (existingResult.error) throw existingResult.error;\n  if (mode === 'monthly' && (existingResult.data || []).some(row => row.mode === 'monthly' && row.entry_status === 'active')) throw new Error('Já existe um total mensal de despesas neste período.');",
    "  const existingResult = await neonTest.from('financial_entries').select('id,occurred_on,mode,entry_status').eq('organization_id', organizationId).eq('competency', competencyDate(month)).eq('type', 'expense');\n  if (existingResult.error) throw existingResult.error;\n  const activeExisting = (existingResult.data || []).filter(row => row.entry_status === 'active');\n  if (mode === 'monthly' && activeExisting.some(row => row.mode === 'monthly')) throw new Error('Já existe um total mensal de despesas neste período.');\n  if (mode === 'daily') {\n    const dates = new Set();\n    const existingDates = new Set(activeExisting.filter(row => row.mode === 'daily').map(row => String(row.occurred_on).slice(0, 10)));\n    for (const row of cleanRows) {\n      if (dates.has(row.date) || existingDates.has(row.date)) throw new Error(`Já existe um total diário de despesas para ${row.date}.`);\n      dates.add(row.date);\n    }\n  }"
)
replace_once(
    'components/BasicControlAppV1.jsx',
    "const expenseModeName = mode => ({ monthly: 'Total do mês', individual: 'Cada despesa' })[mode] || mode;",
    "const expenseModeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada despesa' })[mode] || mode;"
)
replace_once(
    'components/BasicControlAppV1.jsx',
    "<div className={styles.panelHead}><div><h3>Despesas</h3><p>Total do mês ou Cada despesa.</p></div></div>",
    "<div className={styles.panelHead}><div><h3>Despesas</h3><p>Total do mês, Total por dia ou Cada despesa.</p></div></div>"
)
replace_once(
    'components/SimpleControlAppV2.jsx',
    "<div className={styles.modeGrid}>{BASIC_EXPENSE_MODES.map(item => <button type=\"button\" className={`${styles.modeCard} ${expenseMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setExpenseMode(item)}><strong>{item === 'monthly' ? 'Total do mês' : 'Cada despesa'}</strong><span>{item === 'monthly' ? 'Informe apenas o total de gastos do mês.' : 'Registre cada gasto com fornecedor, categoria e pagamento opcionais.'}</span></button>)}</div>",
    "<div className={styles.modeGrid}>{BASIC_EXPENSE_MODES.map(item => <button type=\"button\" className={`${styles.modeCard} ${expenseMode === item ? styles.modeCardActive : ''}`} key={item} onClick={() => setExpenseMode(item)}><strong>{item === 'monthly' ? 'Total do mês' : item === 'daily' ? 'Total por dia' : 'Cada despesa'}</strong><span>{item === 'monthly' ? 'Informe apenas o total de gastos do mês.' : item === 'daily' ? 'Informe quanto a empresa gastou em cada dia.' : 'Registre cada gasto com fornecedor, categoria e pagamento opcionais.'}</span></button>)}</div>"
)

# 4) Importação de despesas: suporte ao modo diário.
replace_once(
    'components/BasicExpenseImport.jsx',
    "const modeName = mode => mode === 'monthly' ? 'Total do mês' : 'Cada despesa';",
    "const modeName = mode => ({ monthly: 'Total do mês', daily: 'Total por dia', individual: 'Cada despesa' })[mode] || mode;"
)
replace_once(
    'components/BasicExpenseImport.jsx',
    "<span>{mode === 'monthly' ? 'Só pode existir um total mensal ativo de despesas no período.' : 'Possíveis duplicidades são avisadas e começam desmarcadas, mas a decisão final continua sendo sua.'}</span>",
    "<span>{mode === 'monthly' ? 'Só pode existir um total mensal ativo de despesas no período.' : mode === 'daily' ? 'Só pode existir um total ativo de despesas por dia.' : 'Possíveis duplicidades são avisadas e começam desmarcadas, mas a decisão final continua sendo sua.'}</span>"
)
replace_once(
    'lib/basic-expense-import.js',
    "const TEMPLATE_HEADERS = {\n  monthly: ['Mês', 'Valor total', 'Observação'],\n  individual: ['Data', 'Valor', 'Descrição', 'Categoria', 'Fornecedor', 'CPF/CNPJ', 'Meio de pagamento']\n};",
    "const TEMPLATE_HEADERS = {\n  monthly: ['Mês', 'Valor total', 'Observação'],\n  daily: ['Data', 'Valor do dia', 'Observação'],\n  individual: ['Data', 'Valor', 'Descrição', 'Categoria', 'Fornecedor', 'CPF/CNPJ', 'Meio de pagamento']\n};"
)
replace_once(
    'lib/basic-expense-import.js',
    "  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });",
    "  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });"
)
replace_once(
    'lib/basic-expense-import.js',
    "  if (mode === 'individual' && columns.date < 0) throw new Error('Não encontrei a coluna “Data”.');",
    "  if (mode !== 'monthly' && columns.date < 0) throw new Error('Não encontrei a coluna “Data”.');"
)
replace_once(
    'lib/basic-expense-import.js',
    "  const existingMonthly = existingEntries.some(item => item.entry_status === 'active' && item.mode === 'monthly');\n  const existingIndividual = existingEntries.filter(item => item.entry_status === 'active' && item.mode === 'individual');\n  const seenMonthly = new Set();\n  const seenIndividual = new Set();",
    "  const existingMonthly = existingEntries.some(item => item.entry_status === 'active' && item.mode === 'monthly');\n  const existingDaily = new Set(existingEntries.filter(item => item.entry_status === 'active' && item.mode === 'daily').map(item => String(item.date).slice(0, 10)));\n  const existingIndividual = existingEntries.filter(item => item.entry_status === 'active' && item.mode === 'individual');\n  const seenMonthly = new Set();\n  const seenDaily = new Set();\n  const seenIndividual = new Set();"
)
old_expense_individual = """      if (normalize(row.paymentName) === 'a prazo') row.errors.push('“A prazo” não é um meio de pagamento. Informe o meio efetivo ou deixe em branco.');
      if (row.categoryName && !catalogMatch(row.categoryName, categories)) row.warnings.push(`Nova categoria: ${row.categoryName}`);
      if (row.paymentName && !catalogMatch(row.paymentName, paymentMethods)) row.warnings.push(`Novo meio de pagamento: ${row.paymentName}`);
      if (row.supplierName && !supplierMatch(row, suppliers)) row.warnings.push(`Novo fornecedor: ${row.supplierName}`);

      const signature = individualSignature(row);
      const existingDuplicate = existingIndividual.some(entry => {
        const entrySignature = individualSignature({
          date: String(entry.date || '').slice(0, 10),
          amount: entry.amount,
          description: entry.description || '',
          supplierName: entry.supplier?.name || ''
        });
        return signature === entrySignature || (
          String(entry.date || '').slice(0, 10) === row.date &&
          sameMoney(entry.amount, row.amount) &&
          normalize(entry.description) === normalize(row.description) &&
          normalize(entry.supplier?.name || '') === normalize(row.supplierName)
        );
      });
      const fileDuplicate = seenIndividual.has(signature);
      if (existingDuplicate || fileDuplicate) {
        row.duplicate = true;
        row.warnings.push(existingDuplicate ? 'Possível duplicidade com uma despesa já cadastrada.' : 'Possível duplicidade dentro do arquivo.');
        row.selected = false;
      }
      seenIndividual.add(signature);"""
new_expense_modes = """      if (mode === 'daily' && row.date) {
        if (existingDaily.has(row.date)) row.errors.push('Já existe um total diário de despesas ativo nesta data.');
        if (seenDaily.has(row.date)) row.errors.push('A data aparece mais de uma vez no arquivo.');
        seenDaily.add(row.date);
      }

      if (mode === 'individual') {
        if (normalize(row.paymentName) === 'a prazo') row.errors.push('“A prazo” não é um meio de pagamento. Informe o meio efetivo ou deixe em branco.');
        if (row.categoryName && !catalogMatch(row.categoryName, categories)) row.warnings.push(`Nova categoria: ${row.categoryName}`);
        if (row.paymentName && !catalogMatch(row.paymentName, paymentMethods)) row.warnings.push(`Novo meio de pagamento: ${row.paymentName}`);
        if (row.supplierName && !supplierMatch(row, suppliers)) row.warnings.push(`Novo fornecedor: ${row.supplierName}`);

        const signature = individualSignature(row);
        const existingDuplicate = existingIndividual.some(entry => {
          const entrySignature = individualSignature({
            date: String(entry.date || '').slice(0, 10),
            amount: entry.amount,
            description: entry.description || '',
            supplierName: entry.supplier?.name || ''
          });
          return signature === entrySignature || (
            String(entry.date || '').slice(0, 10) === row.date &&
            sameMoney(entry.amount, row.amount) &&
            normalize(entry.description) === normalize(row.description) &&
            normalize(entry.supplier?.name || '') === normalize(row.supplierName)
          );
        });
        const fileDuplicate = seenIndividual.has(signature);
        if (existingDuplicate || fileDuplicate) {
          row.duplicate = true;
          row.warnings.push(existingDuplicate ? 'Possível duplicidade com uma despesa já cadastrada.' : 'Possível duplicidade dentro do arquivo.');
          row.selected = false;
        }
        seenIndividual.add(signature);
      }"""
replace_once('lib/basic-expense-import.js', old_expense_individual, new_expense_modes)
replace_once(
    'lib/basic-expense-import.js',
    "  const example = mode === 'monthly'\n    ? [month, '', 'Exemplo — preencha o valor ou apague esta linha']\n    : [`01/${month.slice(5, 7)}/${month.slice(0, 4)}`, '', 'Exemplo — preencha o valor ou apague esta linha', 'Aluguel', 'Fornecedor exemplo', '', 'Pix'];",
    "  const example = mode === 'monthly'\n    ? [month, '', 'Exemplo — preencha o valor ou apague esta linha']\n    : mode === 'daily'\n      ? [`01/${month.slice(5, 7)}/${month.slice(0, 4)}`, '', 'Exemplo — preencha o valor ou apague esta linha']\n      : [`01/${month.slice(5, 7)}/${month.slice(0, 4)}`, '', 'Exemplo — preencha o valor ou apague esta linha', 'Aluguel', 'Fornecedor exemplo', '', 'Pix'];"
)

# 5) Datas Excel/CSV: evita interpretação ambígua do Excel/JS e exibe competências em pt-BR.
for path in ['lib/simple-import.js', 'lib/basic-expense-import.js']:
    text = Path(path).read_text(encoding='utf-8')
    if "const displayMonth = key =>" not in text:
        text = text.replace(
            "const sameMoney = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;",
            "const sameMoney = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.005;\nconst displayMonth = key => /^\\d{4}-\\d{2}$/.test(String(key || '')) ? `${String(key).slice(5, 7)}/${String(key).slice(0, 4)}` : String(key || '');",
            1
        )
    text = text.replace("XLSX.read(buffer, { type: 'array', cellDates: true })", "XLSX.read(buffer, { type: 'array', cellDates: false })")
    text = text.replace("`Esta tela está em ${month}; a linha pertence a ${parsedMonth}.`", "`Esta tela está em ${displayMonth(month)}; a linha pertence a ${displayMonth(parsedMonth)}.`")
    text = text.replace("`Esta tela está em ${month}; a linha pertence a ${row.date.slice(0, 7)}.`", "`Esta tela está em ${displayMonth(month)}; a linha pertence a ${displayMonth(row.date.slice(0, 7))}.`")
    Path(path).write_text(text, encoding='utf-8')

# Remove aviso antigo de ambiente de teste da tela oficial.
replace_once(
    'components/SimpleControlAppV2.jsx',
    "      <div className={styles.infoBox}><strong>Ambiente de teste</strong><span>Este preview está conectado somente à estrutura de testes da Central Financeira.</span></div>\n",
    ""
)

print('Correções pré-Codex aplicadas com sucesso.')
