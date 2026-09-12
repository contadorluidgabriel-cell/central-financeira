export const DEFAULT_REVENUE_CATEGORIES = ['Vendas', 'Serviços', 'Outras receitas'];
export const DEFAULT_EXPENSE_CATEGORIES = ['Mercadorias','Fornecedores','Funcionários','Pró-labore / retirada','Aluguel','Energia','Água','Internet','Impostos','Marketing','Transporte','Tarifas','Outras'];

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonth(key) {
  let [year, month] = key.split('-').map(Number);
  month -= 1;
  if (month === 0) { month = 12; year -= 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function nextMonth(key) {
  let [year, month] = key.split('-').map(Number);
  month += 1;
  if (month === 13) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function createDemoState() {
  const current = monthKey();
  const previous = previousMonth(current);

  return {
    loggedIn: false,
    role: 'master',
    view: 'dashboard',
    selectedCompany: null,
    tab: 'overview',
    month: current,
    filter: 'all',
    search: '',
    companies: [
      { id:'c1', name:'Mercado do João', document:'12.345.678/0001-90', contact:'joao@mercado.com', revenueMode:'individual', expenseEnabled:true, expenseMode:'category', customRevenueCategories:[], customExpenseCategories:['Embalagens'] },
      { id:'c2', name:'Studio Ana', document:'23.456.789/0001-14', contact:'ana@studio.com', revenueMode:'monthly', expenseEnabled:false, expenseMode:'category', customRevenueCategories:['Mentorias'], customExpenseCategories:[] },
      { id:'c3', name:'Mecânica Silva', document:'34.567.890/0001-18', contact:'silva@mecanica.com', revenueMode:'daily', expenseEnabled:true, expenseMode:'individual', customRevenueCategories:[], customExpenseCategories:['Peças','Lubrificantes'] },
      { id:'c4', name:'Barbearia Carlos', document:'45.678.901/0001-09', contact:'carlos@barbearia.com', revenueMode:'individual', expenseEnabled:true, expenseMode:'individual', customRevenueCategories:[], customExpenseCategories:[] }
    ],
    entries: [
      {id:'e1',companyId:'c1',type:'revenue',month:current,date:`${current}-02`,description:'Vendas balcão',category:'Vendas',amount:7200},
      {id:'e2',companyId:'c1',type:'revenue',month:current,date:`${current}-07`,description:'Vendas semana',category:'Vendas',amount:8650},
      {id:'e3',companyId:'c1',type:'revenue',month:current,date:`${current}-11`,description:'Vendas balcão',category:'Vendas',amount:6600},
      {id:'e4',companyId:'c1',type:'expense',month:current,date:`${current}-03`,description:'Mercadorias',category:'Mercadorias',amount:6800},
      {id:'e5',companyId:'c1',type:'expense',month:current,date:`${current}-05`,description:'Funcionários',category:'Funcionários',amount:5100},
      {id:'e6',companyId:'c1',type:'expense',month:current,date:`${current}-06`,description:'Aluguel',category:'Aluguel',amount:2200},
      {id:'e7',companyId:'c1',type:'expense',month:current,date:`${current}-09`,description:'Energia',category:'Energia',amount:1180},
      {id:'e8',companyId:'c1',type:'revenue',month:previous,date:`${previous}-02`,description:'Total mês anterior',category:'Vendas',amount:20800},
      {id:'e9',companyId:'c1',type:'expense',month:previous,date:`${previous}-05`,description:'Despesas mês anterior',category:'Outras',amount:14100},
      {id:'e10',companyId:'c2',type:'revenue',month:current,date:`${current}-01`,description:'Total do mês',category:'Serviços',amount:14200,mode:'monthly'},
      {id:'e11',companyId:'c2',type:'revenue',month:previous,date:`${previous}-01`,description:'Total do mês',category:'Serviços',amount:13100,mode:'monthly'},
      {id:'e12',companyId:'c3',type:'revenue',month:current,date:`${current}-05`,description:'Serviços do dia',category:'Serviços',amount:37800,mode:'daily'},
      {id:'e13',companyId:'c3',type:'expense',month:current,date:`${current}-05`,description:'Peças e insumos',category:'Fornecedores',amount:22800,mode:'individual'},
      {id:'e14',companyId:'c4',type:'revenue',month:current,date:`${current}-03`,description:'Serviços',category:'Serviços',amount:11450,mode:'individual'},
      {id:'e15',companyId:'c4',type:'expense',month:current,date:`${current}-04`,description:'Operação',category:'Outras',amount:6200,mode:'individual'}
    ],
    submissions: [
      { companyId:'c2', month:current, confirmedAt:new Date().toISOString() },
      { companyId:'c4', month:current, confirmedAt:new Date().toISOString() }
    ],
    closings: [
      { companyId:'c4', month:current, analysis:'Faturamento manteve estabilidade e os custos ficaram controlados.', attention:'Acompanhar insumos no próximo mês.', recommendation:'Revisar preços dos serviços com maior consumo de produto.', closed:true }
    ]
  };
}
