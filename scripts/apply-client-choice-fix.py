from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


# Admin V2: o contador cadastra a empresa, mas não escolhe o controle financeiro.
path = Path('components/CentralFinanceiraV2.jsx')
text = path.read_text(encoding='utf-8')

old_draft = """const defaultCompanyDraft = () => ({
  name: '', document: '', contact: '', revenueMode: 'monthly', expenseEnabled: true, expenseMode: 'category',
  modules: { ...DEFAULT_FINANCE_MODULES }
});"""
new_draft = "const defaultCompanyDraft = () => ({ name: '', document: '', contact: '' });"
text = replace_once(text, old_draft, new_draft, 'defaultCompanyDraft')

old_clients_header = 'return <><PageHeader title="Clientes" description="Acesse o financeiro de cada empresa e ajuste o nível de acompanhamento.">'
new_clients_header = 'return <><PageHeader title="Clientes" description="Acesse o financeiro de cada empresa e acompanhe a configuração escolhida pelo cliente.">'
text = replace_once(text, old_clients_header, new_clients_header, 'MasterClients header')

old_modal = '''    if (modal.type === 'company') return <ModalShell title="Novo cliente" wide footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy||!companyDraft.name.trim()} onClick={async()=>{const id=await run(()=>createCompanyV2(companyDraft),null,{refreshAfter:false});if(id){await refresh(false);setModal(null);setCompanyDraft(defaultCompanyDraft());setToast('Cliente criado com a Central configurada')}}}>Criar cliente</button></>}><div className={styles.formGrid2}><div className="field full"><label>Nome da empresa</label><input className="input" value={companyDraft.name} onChange={e=>setCompanyDraft(d=>({...d,name:e.target.value}))} autoFocus/></div><div className="field"><label>CNPJ / CPF</label><input className="input" value={companyDraft.document} onChange={e=>setCompanyDraft(d=>({...d,document:e.target.value}))}/></div><div className="field"><label>E-mail principal</label><input className="input" type="email" value={companyDraft.contact} onChange={e=>setCompanyDraft(d=>({...d,contact:e.target.value}))}/></div><div className="field"><label>Como controlar receitas</label><select className="select" value={companyDraft.revenueMode} onChange={e=>setCompanyDraft(d=>({...d,revenueMode:e.target.value}))}><option value="monthly">Total do mês</option><option value="daily">Total por dia</option><option value="individual">Cada recebimento</option></select></div><div className="field"><label>Despesas</label><select className="select" value={companyDraft.expenseEnabled?'yes':'no'} onChange={e=>setCompanyDraft(d=>({...d,expenseEnabled:e.target.value==='yes',modules:{...d.modules,expenses:e.target.value==='yes'}}))}><option value="yes">Acompanhar</option><option value="no">Não acompanhar</option></select></div>{companyDraft.expenseEnabled&&<div className="field"><label>Como controlar despesas</label><select className="select" value={companyDraft.expenseMode} onChange={e=>setCompanyDraft(d=>({...d,expenseMode:e.target.value}))}><option value="monthly">Total do mês</option><option value="category">Por categoria</option><option value="individual">Cada gasto</option></select></div>}</div><div className={styles.modalHint}><b>Personalização inicial:</b> marque apenas os recursos que farão parte da rotina desta empresa. Isso pode ser alterado depois.</div><div className={styles.moduleGrid}>{MODULE_META.map(([key,title,text])=><label className={styles.moduleCard} key={key}><input type="checkbox" checked={Boolean(companyDraft.modules[key])} onChange={e=>setCompanyDraft(d=>({...d,modules:{...d.modules,[key]:e.target.checked}}))}/><div><strong>{title}</strong><span>{text}</span></div></label>)}</div></ModalShell>;'''
new_modal = '''    if (modal.type === 'company') return <ModalShell title="Novo cliente" footer={<><button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy||!companyDraft.name.trim()} onClick={async()=>{const id=await run(()=>createCompanyV2(companyDraft),null,{refreshAfter:false});if(id){await refresh(false);setModal(null);setCompanyDraft(defaultCompanyDraft());setToast('Cliente criado. A configuração financeira será escolhida por ele no primeiro acesso.')}}}>Criar cliente</button></>}><div className={styles.formGrid2}><div className="field full"><label>Nome da empresa</label><input className="input" value={companyDraft.name} onChange={e=>setCompanyDraft(d=>({...d,name:e.target.value}))} autoFocus/></div><div className="field"><label>CNPJ / CPF</label><input className="input" value={companyDraft.document} onChange={e=>setCompanyDraft(d=>({...d,document:e.target.value}))}/></div><div className="field"><label>E-mail principal</label><input className="input" type="email" value={companyDraft.contact} onChange={e=>setCompanyDraft(d=>({...d,contact:e.target.value}))}/></div></div><div className={styles.modalHint}><b>Configuração pelo cliente:</b> você cadastra a empresa e libera o acesso. No primeiro acesso, o próprio cliente escolhe o nível de controle e como deseja acompanhar as informações.</div></ModalShell>;'''
text = replace_once(text, old_modal, new_modal, 'company modal')
path.write_text(text, encoding='utf-8')


# Criação de empresa: nasce sem nível de controle escolhido pelo contador.
path = Path('lib/neon-v2-data.js')
text = path.read_text(encoding='utf-8')
old_create = '''export async function createCompanyV2({ name, document, contact, revenueMode, expenseEnabled, expenseMode = 'category', modules = DEFAULT_FINANCE_MODULES }) {
  const organizationId = await createBaseCompany({ name, document, contact, revenueMode, expenseEnabled });
  if (expenseEnabled && expenseMode !== 'category') {
    const settings = await neonTest.from('organization_settings').update({ expense_mode: expenseMode, updated_at: new Date().toISOString() }).eq('organization_id', organizationId);
    if (settings.error) throw settings.error;
  }
  const profile = await neonTest.from('finance_profiles').insert({
    organization_id: organizationId,
    modules: { ...DEFAULT_FINANCE_MODULES, ...modules },
    dashboard_mode: 'financial',
    default_projection_days: 30
  });
  if (profile.error) throw profile.error;
  return organizationId;
}'''
new_create = '''export async function createCompanyV2({ name, document, contact }) {
  const organizationId = await createBaseCompany({
    name,
    document,
    contact,
    revenueMode: 'monthly',
    expenseEnabled: false
  });

  const settings = await neonTest.from('organization_settings').update({
    control_tier: 'unconfigured',
    control_start_month: null,
    pending_revenue_mode: null,
    pending_revenue_mode_effective: null,
    expense_enabled: false,
    expense_mode: 'category',
    updated_at: new Date().toISOString()
  }).eq('organization_id', organizationId);
  if (settings.error) throw settings.error;

  const initialModules = Object.fromEntries(
    Object.keys(DEFAULT_FINANCE_MODULES).map(key => [key, false])
  );
  const profile = await neonTest.from('finance_profiles').insert({
    organization_id: organizationId,
    modules: initialModules,
    dashboard_mode: 'financial',
    default_projection_days: 30
  });
  if (profile.error) throw profile.error;
  return organizationId;
}'''
text = replace_once(text, old_create, new_create, 'createCompanyV2')
path.write_text(text, encoding='utf-8')


# Roteamento: empresa ainda sem configuração deve ir ao onboarding do cliente.
path = Path('components/CentralFinanceiraEntry.jsx')
text = path.read_text(encoding='utf-8')
old_select = ".select('organization_id,control_tier,active')"
new_select = ".select('organization_id,control_tier,control_start_month,active')"
text = replace_once(text, old_select, new_select, 'entry select')
old_use = "const useSimple = settings?.active !== false && settings?.control_tier === 'simple';"
new_use = "const useSimple = settings?.active !== false && (settings?.control_tier === 'unconfigured' || settings?.control_tier === 'simple' || !settings?.control_start_month);"
text = replace_once(text, old_use, new_use, 'entry routing')
path.write_text(text, encoding='utf-8')


# Onboarding: deixa explícito que a escolha é do próprio cliente.
path = Path('components/SimpleControlAppV2.jsx')
text = path.read_text(encoding='utf-8')
old_onboarding = '''<span className={styles.eyebrow}>Configuração inicial</span><h1>Como você prefere registrar seu faturamento?</h1><p>Você poderá mudar o modo depois. A alteração começa no mês seguinte para preservar o histórico.</p><div className={styles.modeGrid}>'''
new_onboarding = '''<span className={styles.eyebrow}>Configuração da sua Central</span><h1>Como você quer controlar sua empresa?</h1><p>A escolha é sua. O contador acompanha a configuração, mas não decide o nível nem o modo por você.</p><div className={styles.infoBox}><strong>Controle Simples</strong><span>Para acompanhar o faturamento sem precisar controlar despesas, contas a pagar, contas a receber ou caixa. Este é o primeiro nível disponível nesta fase.</span></div><p><strong>Como você prefere registrar seu faturamento?</strong> Você poderá mudar este modo depois; a alteração passa a valer no mês seguinte para preservar o histórico.</p><div className={styles.modeGrid}>'''
text = replace_once(text, old_onboarding, new_onboarding, 'simple onboarding')
text = replace_once(text, "{busy ? 'Configurando…' : 'Começar'}</button>", "{busy ? 'Configurando…' : 'Usar Controle Simples'}</button>", 'onboarding button')
path.write_text(text, encoding='utf-8')

print('Client-choice product rule applied successfully.')
