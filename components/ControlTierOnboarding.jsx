'use client';

import { useEffect, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import { updateBasicSettings } from '../lib/neon-basic-control';
import { monthKey } from '../lib/neon-simple-control';
import styles from './ControlTierOnboarding.module.css';

const TIERS = [
  { id: 'simple', title: 'Controle Simples', eyebrow: 'Faturamento', description: 'Para quem quer acompanhar quanto vendeu sem controlar despesas e caixa.', points: ['Total do mês, por dia ou cada receita', 'Fechamento mensal', 'Relatório de faturamento'] },
  { id: 'basic', title: 'Controle Básico', eyebrow: 'Resultado', description: 'Adiciona despesas e uma visão gerencial do resultado do negócio.', points: ['Tudo do Simples', 'Despesas por competência', 'Resultado gerencial mensal'] },
  { id: 'complete', title: 'Controle Completo', eyebrow: 'Financeiro', description: 'Separa competência, compromissos e dinheiro efetivamente movimentado.', points: ['Tudo do Básico', 'Contas a receber e a pagar', 'Contas, baixas e transferências'] }
];

export default function ControlTierOnboarding() {
  const session = neonTest.auth.useSession();
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [organization, setOrganization] = useState(null);
  const [tier, setTier] = useState('simple');
  const [revenueMode, setRevenueMode] = useState('monthly');
  const [expenseMode, setExpenseMode] = useState('monthly');
  const [startMonth, setStartMonth] = useState(monthKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await neonTest.auth.organization.list();
        if (result?.error) throw result.error;
        const organizations = result?.data || [];
        const current = organizations.find(item => item.id === activeOrganizationId) || organizations[0] || null;
        if (!current) throw new Error('Nenhuma empresa vinculada a este acesso.');
        if (activeOrganizationId !== current.id) {
          const activate = await neonTest.auth.organization.setActive({ organizationId: current.id });
          if (activate?.error) throw activate.error;
          window.location.reload();
          return;
        }
        if (!cancelled) setOrganization(current);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Não foi possível carregar a empresa.');
      }
    })();
    return () => { cancelled = true; };
  }, [activeOrganizationId]);

  async function submit(event) {
    event.preventDefault();
    if (!organization) return;
    setBusy(true); setError('');
    try {
      await updateBasicSettings(organization.id, {
        controlTier: tier,
        controlStartMonth: startMonth,
        revenueMode,
        expenseEnabled: tier === 'basic' || tier === 'complete',
        expenseMode: tier === 'simple' ? 'monthly' : expenseMode
      });
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Não foi possível configurar o controle.');
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); } finally { window.location.reload(); }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.brand}>LG</div>
        <div><span>Configuração inicial</span><h1>Como você quer controlar sua empresa?</h1><p>Escolha o nível de detalhe. O histórico não será reinterpretado quando você mudar de nível no futuro.</p></div>
      </header>

      {organization && <div className={styles.company}><small>Empresa</small><strong>{organization.name}</strong></div>}
      {error && <div className={styles.error}>{error}</div>}

      <form onSubmit={submit}>
        <div className={styles.tiers}>{TIERS.map(item => <label className={`${styles.tier} ${tier === item.id ? styles.selected : ''}`} key={item.id}><input type="radio" name="tier" value={item.id} checked={tier === item.id} onChange={() => setTier(item.id)}/><span className={styles.radio}></span><small>{item.eyebrow}</small><strong>{item.title}</strong><p>{item.description}</p><ul>{item.points.map(point => <li key={point}>{point}</li>)}</ul></label>)}</div>

        <div className={styles.settings}>
          <label><span>Começar a partir de</span><input type="month" required value={startMonth} onChange={e => setStartMonth(e.target.value)}/></label>
          <label><span>Como informar receitas</span><select value={revenueMode} onChange={e => setRevenueMode(e.target.value)}><option value="monthly">Total do mês</option><option value="daily">Total por dia</option><option value="individual">Cada receita</option></select></label>
          {tier !== 'simple' && <label><span>Como informar despesas</span><select value={expenseMode} onChange={e => setExpenseMode(e.target.value)}><option value="monthly">Total do mês</option><option value="daily">Total por dia</option><option value="individual">Cada despesa</option></select></label>}
        </div>

        {tier === 'complete' && <div className={styles.note}><strong>O que acontece depois?</strong><p>Você cadastra os saldos iniciais das suas contas e, se existirem, valores antigos a receber ou pagar como saldos de abertura. Eles entram no financeiro sem alterar o resultado do mês.</p></div>}

        <footer className={styles.actions}><button type="button" className={styles.secondary} onClick={signOut} disabled={busy}>Sair</button><button className={styles.primary} disabled={busy || !organization}>{busy ? 'Configurando…' : 'Começar'}</button></footer>
      </form>
    </section>
  </main>;
}
