from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: target not found')
    return text.replace(old, new, 1)


simple_path = Path('components/SimpleControlAppV2.jsx')
simple = simple_path.read_text(encoding='utf-8')
simple = simple.replace(
    "import { BASIC_EXPENSE_MODES, scheduleControlTier, updateBasicSettings } from '../lib/neon-basic-control';",
    "import { BASIC_EXPENSE_MODES, updateBasicSettings } from '../lib/neon-basic-control';"
)
simple_path.write_text(simple, encoding='utf-8')

basic_path = Path('components/BasicControlAppV1.jsx')
basic = basic_path.read_text(encoding='utf-8')

basic = basic.replace(
    "{ category: '', customer: '', supplier: '', payment: '', min: '', max: '', sort: 'date_desc' }",
    "{ category: '', customer: '', supplier: '', payment: '', status: '', min: '', max: '', sort: 'date_desc' }"
)

basic = replace_once(
    basic,
    "    if (filters.payment && entry.payment_method_id !== filters.payment) return false;\n    if (filters.min && Number(entry.amount) < Number(filters.min)) return false;",
    "    if (filters.payment && entry.payment_method_id !== filters.payment) return false;\n    if (filters.status && entry.entry_status !== filters.status) return false;\n    if (filters.min && Number(entry.amount) < Number(filters.min)) return false;",
    'status filter logic'
)

filters_pattern = r'function Filters\(\{ kind, mode, search, setSearch, filters, setFilters, categories, parties, paymentMethods \}\) \{.*?\n\}\n\nfunction EntryTable'
filters_replacement = r'''function Filters({ kind, mode, search, setSearch, filters, setFilters, categories, parties, paymentMethods }) {
  const detailed = mode === 'individual';
  return <div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search"/><input placeholder={kind === 'revenue' ? 'Buscar receita' : 'Buscar despesa'} value={search} onChange={e => setSearch(e.target.value)}/></label><select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Todos os status</option><option value="active">Ativos</option><option value="cancelled">Cancelados</option><option value="adjustment">Ajustes</option></select>{detailed && <><select value={kind === 'revenue' ? filters.customer : filters.supplier} onChange={e => setFilters({ ...filters, [kind === 'revenue' ? 'customer' : 'supplier']: e.target.value })}><option value="">{kind === 'revenue' ? 'Todos os clientes' : 'Todos os fornecedores'}</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value="">Todas as categorias</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={filters.payment} onChange={e => setFilters({ ...filters, payment: e.target.value })}><option value="">Todos os meios</option>{paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input type="number" min="0" step="0.01" placeholder="Valor mín." value={filters.min} onChange={e => setFilters({ ...filters, min: e.target.value })}/><input type="number" min="0" step="0.01" placeholder="Valor máx." value={filters.max} onChange={e => setFilters({ ...filters, max: e.target.value })}/><select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value })}><option value="date_desc">Mais recentes</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></>}</div>;
}

function EntryTable'''
basic, count = re.subn(filters_pattern, filters_replacement, basic, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Filters function: target not found')

basic = replace_once(
    basic,
    "onEdit={party => setModal({ type: 'customer', party })} onToggle=",
    "onOpen={party => setModal({ type: 'customerDetail', party })} onEdit={party => setModal({ type: 'customer', party })} onToggle=",
    'customer detail action'
)
basic = replace_once(
    basic,
    "onEdit={party => setModal({ type: 'supplier', party })} onToggle=",
    "onOpen={party => setModal({ type: 'supplierDetail', party })} onEdit={party => setModal({ type: 'supplier', party })} onToggle=",
    'supplier detail action'
)

party_pattern = r'function PartyPage\(\{ title, kind, parties, entries, onCreate, onEdit, onToggle, onDelete, onMerge \}\) \{.*?\n\}\n\nfunction Reports'
party_replacement = r'''function PartyPage({ title, kind, parties, entries, onCreate, onOpen, onEdit, onToggle, onDelete, onMerge }) {
  const [partySearch, setPartySearch] = useState('');
  const query = partySearch.trim().toLowerCase();
  const normal = parties.filter(p => (kind === 'customer' ? !p.is_consumer_final : !p.is_unspecified) && (!query || `${p.name} ${p.code || ''} ${p.document || ''}`.toLowerCase().includes(query)));
  const rows = normal.map(party => {
    const allLinked = entries.filter(e => (kind === 'customer' ? e.customer_id : e.supplier_id) === party.id);
    const active = allLinked.filter(e => e.entry_status === 'active');
    const total = active.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const last = [...allLinked].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return { party, total, count: active.length, linkedCount: allLinked.length, average: active.length ? total / active.length : 0, last };
  }).sort((a, b) => b.total - a.total);
  return <><PageHeader title={title} description={kind === 'customer' ? 'Cadastro financeiro leve dos clientes vinculados às receitas.' : 'Cadastro financeiro leve dos fornecedores vinculados às despesas.'}><button className={styles.secondaryButtonSmall} onClick={onMerge}>Mesclar</button><button className={styles.primaryButtonSmall} onClick={onCreate}><Icon name="plus"/>Novo</button></PageHeader><div className={styles.toolbar}><label className={styles.searchBox}><Icon name="search"/><input placeholder={`Buscar ${kind === 'customer' ? 'cliente' : 'fornecedor'} por nome, código ou documento`} value={partySearch} onChange={e => setPartySearch(e.target.value)}/></label></div><div className={styles.customerGrid}>{rows.map(({ party, total, count, linkedCount, average, last }) => <article className={`${styles.customerCard} ${!party.active ? styles.customerInactive : ''}`} key={party.id}><button className={styles.customerMain} onClick={() => onOpen(party)}><div className={styles.customerAvatar}>{initials(party.name)}</div><div><strong>{party.name}</strong><span>{party.code}{party.external_code ? ` · ${party.external_code}` : ''}</span></div></button><div className={styles.customerStats}><div><span>Total</span><b>{money(total)}</b></div><div><span>Lançamentos</span><b>{count}</b></div><div><span>Média</span><b>{money(average)}</b></div></div><div className={styles.customerFoot}><span>{last ? `Último: ${formatDate(last.date)}` : 'Sem lançamentos'}</span><div><button onClick={() => onEdit(party)}>Editar</button>{linkedCount === 0 ? <button onClick={() => { if (window.confirm(`Excluir ${party.name}? Este cadastro ainda não possui histórico.`)) onDelete(party); }}>Excluir</button> : <button onClick={() => onToggle(party)}>{party.active ? 'Inativar' : 'Reativar'}</button>}</div></div></article>)}</div>{!rows.length && <div className={styles.emptyInline}>Nenhum cadastro encontrado.</div>}</>;
}

function PartyDetail({ kind, party, entries }) {
  const linked = entries.filter(e => (kind === 'customer' ? e.customer_id : e.supplier_id) === party.id);
  const active = linked.filter(e => e.entry_status === 'active');
  const total = active.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const last = [...linked].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return <div className={styles.detail}><div className={styles.detailHero}><div className={styles.customerAvatar}>{initials(party.name)}</div><div><h3>{party.name}</h3><p>{party.code}{party.external_code ? ` · ${party.external_code}` : ''}{party.document ? ` · ${party.document}` : ''}</p></div></div><div className={styles.detailStats}><Metric label={kind === 'customer' ? 'Faturado' : 'Despesas'} value={money(total)} detail="Lançamentos ativos"/><Metric label="Lançamentos" value={active.length} detail={`Média ${money(active.length ? total / active.length : 0)}`}/><Metric label="Último lançamento" value={last ? formatDate(last.date) : '—'} detail={last ? money(last.amount) : 'Sem histórico'}/></div><h4>Histórico</h4><div className={styles.list}>{[...linked].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 50).map(entry => <div className={styles.listRow} key={entry.id}><div><strong>{entry.description || (kind === 'customer' ? 'Receita' : 'Despesa')}</strong><span>{formatDate(entry.date)} · {entry.category?.name || 'Sem categoria'} · {entry.paymentMethod?.name || 'Não informado'} · {entry.entry_status === 'cancelled' ? 'Cancelado' : entry.entry_status === 'adjustment' ? 'Ajuste' : 'Ativo'}</span></div><b className={entry.entry_status === 'cancelled' ? styles.strike : ''}>{money(entry.amount)}</b></div>)}{!linked.length && <div className={styles.emptyInline}>Ainda não há histórico vinculado.</div>}</div></div>;
}

function Reports'''
basic, count = re.subn(party_pattern, party_replacement, basic, count=1, flags=re.S)
if count != 1:
    raise SystemExit('PartyPage: target not found')

anchor = "      {modal.type === 'supplier' && <PartyForm kind=\"supplier\""
idx = basic.find(anchor)
if idx < 0:
    raise SystemExit('party modal anchor not found')
line_end = basic.find('\n', idx)
insert = "\n      {modal.type === 'customerDetail' && <PartyDetail kind=\"customer\" party={modal.party} entries={allCompanyEntries.filter(e => e.type === 'revenue')}/>}\n      {modal.type === 'supplierDetail' && <PartyDetail kind=\"supplier\" party={modal.party} entries={allCompanyEntries.filter(e => e.type === 'expense')}/>}"
basic = basic[:line_end] + insert + basic[line_end:]

basic = replace_once(
    basic,
    "customer:'Cliente',supplier:'Fornecedor',customerMerge:'Mesclar clientes',supplierMerge:'Mesclar fornecedores'",
    "customer:'Cliente',supplier:'Fornecedor',customerDetail:'Detalhes do cliente',supplierDetail:'Detalhes do fornecedor',customerMerge:'Mesclar clientes',supplierMerge:'Mesclar fornecedores'",
    'detail modal titles'
)

basic_path.write_text(basic, encoding='utf-8')
