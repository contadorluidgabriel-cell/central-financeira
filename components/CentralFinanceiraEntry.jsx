'use client';

import { useEffect, useState } from 'react';
import { neonTest } from '../lib/neon-test-client';
import { completeFirstPasswordChange, touchClientLogin } from '../lib/client-access';
import CentralFinanceiraV2 from './CentralFinanceiraV2';
import SimpleControlAppV2 from './SimpleControlAppV2';
import BasicControlAppV1 from './BasicControlAppV1';
import CompleteControlAppV1 from './CompleteControlAppV1';
import ControlTierOnboarding from './ControlTierOnboarding';

function PasswordChangeGate({ email }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('As novas senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      await completeFirstPasswordChange({ currentPassword, newPassword });
      window.location.reload();
    } catch (err) {
      setError(err?.message || 'Não foi possível alterar a senha.');
      setBusy(false);
    }
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,fontFamily:'Inter,system-ui,sans-serif',background:'#F6F8FC',color:'#182230'}}>
      <section style={{width:'min(100%,460px)',background:'#fff',border:'1px solid #E4E9F1',borderRadius:18,padding:28,boxShadow:'0 18px 50px rgba(24,34,48,.08)'}}>
        <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:12,background:'#EEF3FF',color:'#2456E8',fontWeight:800,marginBottom:18}}>LG</div>
        <div style={{fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#2456E8',marginBottom:8}}>Primeiro acesso</div>
        <h1 style={{fontSize:26,lineHeight:1.15,margin:'0 0 10px'}}>Crie sua senha</h1>
        <p style={{margin:'0 0 22px',color:'#667085',fontSize:14,lineHeight:1.55}}>Você entrou com uma senha provisória. Antes de acessar os dados da empresa, defina uma senha pessoal.</p>
        <div style={{padding:'12px 14px',borderRadius:12,background:'#F6F8FC',border:'1px solid #E4E9F1',fontSize:13,color:'#475467',marginBottom:20}}><strong style={{color:'#182230'}}>Login:</strong> {email || 'e-mail do cliente'}</div>
        {error && <div style={{padding:'11px 13px',borderRadius:10,background:'#FFF3F2',border:'1px solid #F2C9C5',color:'#B42318',fontSize:13,marginBottom:16}}>{error}</div>}
        <form onSubmit={submit} style={{display:'grid',gap:14}}>
          <label style={{display:'grid',gap:6,fontSize:13,fontWeight:600}}>Senha provisória<input autoFocus type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required style={{height:42,border:'1px solid #D0D5DD',borderRadius:10,padding:'0 12px',font:'inherit',outline:'none'}}/></label>
          <label style={{display:'grid',gap:6,fontSize:13,fontWeight:600}}>Nova senha<input type="password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} required style={{height:42,border:'1px solid #D0D5DD',borderRadius:10,padding:'0 12px',font:'inherit',outline:'none'}}/></label>
          <label style={{display:'grid',gap:6,fontSize:13,fontWeight:600}}>Confirmar nova senha<input type="password" minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required style={{height:42,border:'1px solid #D0D5DD',borderRadius:10,padding:'0 12px',font:'inherit',outline:'none'}}/></label>
          <button type="submit" disabled={busy} style={{height:44,border:0,borderRadius:10,background:'#2456E8',color:'#fff',fontWeight:700,fontSize:14,cursor:busy?'wait':'pointer',opacity:busy ? .72 : 1}}>{busy ? 'Salvando…' : 'Salvar nova senha e continuar'}</button>
        </form>
        <p style={{margin:'14px 0 0',fontSize:12,color:'#667085',lineHeight:1.5}}>A senha provisória deixa de funcionar após a troca.</p>
      </section>
    </main>
  );
}

function AccessGate({ title, message }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try { await neonTest.auth.signOut(); } finally { window.location.reload(); }
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,fontFamily:'Inter,system-ui,sans-serif',background:'#F6F8FC',color:'#182230'}}>
      <section style={{width:'min(100%,460px)',background:'#fff',border:'1px solid #E4E9F1',borderRadius:18,padding:28,boxShadow:'0 18px 50px rgba(24,34,48,.08)'}}>
        <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:12,background:'#EEF3FF',color:'#2456E8',fontWeight:800,marginBottom:18}}>LG</div>
        <h1 style={{fontSize:24,lineHeight:1.2,margin:'0 0 10px'}}>{title}</h1>
        <p style={{margin:'0 0 20px',color:'#667085',fontSize:14,lineHeight:1.55}}>{message}</p>
        <button type="button" onClick={signOut} disabled={busy} style={{height:42,border:'1px solid #D0D5DD',borderRadius:10,background:'#fff',color:'#182230',padding:'0 16px',fontWeight:700,fontSize:14,cursor:busy?'wait':'pointer'}}>{busy ? 'Saindo…' : 'Sair'}</button>
      </section>
    </main>
  );
}

export default function CentralFinanceiraEntry() {
  const session = neonTest.auth.useSession();
  const user = session.data?.user || null;
  const activeOrganizationId = session.data?.session?.activeOrganizationId || null;
  const [experience, setExperience] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    async function resolveExperience() {
      if (session.isPending) return;
      if (!user) {
        if (!cancelled) setExperience('v2');
        return;
      }

      try {
        const roleResult = await neonTest.from('app_users').select('system_role,active,must_change_password,organization_id').eq('user_id', user.id).limit(1);
        if (roleResult.error) throw roleResult.error;
        const appUser = roleResult.data?.[0] || null;

        if (!appUser) {
          if (!cancelled) setExperience('denied');
          return;
        }

        if (!appUser.active) {
          if (!cancelled) setExperience('blocked');
          return;
        }

        if (appUser.system_role !== 'client_user') {
          if (!cancelled) setExperience('v2');
          return;
        }

        if (appUser.must_change_password) {
          if (!cancelled) setExperience('password-change');
          return;
        }

        const orgResult = await neonTest.auth.organization.list();
        if (orgResult?.error) throw orgResult.error;
        const organizations = orgResult?.data || [];
        const organizationId = appUser.organization_id || null;

        if (!organizationId || !organizations.some(org => org.id === organizationId)) {
          if (!cancelled) setExperience('no-company');
          return;
        }

        if (activeOrganizationId !== organizationId) {
          const activate = await neonTest.auth.organization.setActive({ organizationId });
          if (activate?.error) throw activate.error;
          window.location.reload();
          return;
        }

        const settingsResult = await neonTest
          .from('organization_settings')
          .select('organization_id,control_tier,control_start_month,active')
          .eq('organization_id', organizationId)
          .limit(1);
        if (settingsResult.error) throw settingsResult.error;

        const settings = settingsResult.data?.[0] || null;
        if (settings?.active === false) {
          if (!cancelled) setExperience('blocked');
          return;
        }

        try { await touchClientLogin(); } catch {}

        const needsOnboarding = !settings || settings.control_tier === 'unconfigured' || !settings.control_start_month;
        if (!cancelled) {
          if (needsOnboarding) setExperience('onboarding');
          else if (settings.control_tier === 'simple') setExperience('simple');
          else if (settings.control_tier === 'basic') setExperience('basic');
          else if (settings.control_tier === 'complete') setExperience('complete');
          else setExperience('access-error');
        }
      } catch {
        if (!cancelled) setExperience('access-error');
      }
    }

    resolveExperience();
    return () => { cancelled = true; };
  }, [session.isPending, user?.id, activeOrganizationId]);

  if (session.isPending || experience === 'loading') {
    return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui,sans-serif',background:'#F6F8FC',color:'#667085'}}>Carregando Central Financeira…</div>;
  }

  if (experience === 'password-change') return <PasswordChangeGate email={user?.email}/>;
  if (experience === 'denied') return <AccessGate title="Acesso não autorizado" message="Este usuário não possui acesso cadastrado na Central Financeira. Entre com o e-mail liberado pelo escritório."/>;
  if (experience === 'blocked') return <AccessGate title="Acesso bloqueado" message="Este acesso está bloqueado. Entre em contato com o escritório para reativação."/>;
  if (experience === 'no-company') return <AccessGate title="Empresa não vinculada" message="Seu usuário existe, mas o vínculo com a empresa não está válido. Entre em contato com o escritório."/>;
  if (experience === 'access-error') return <AccessGate title="Não foi possível validar o acesso" message="A Central não liberou nenhuma área porque não foi possível confirmar suas permissões. Tente novamente ou entre em contato com o escritório."/>;
  if (experience === 'onboarding') return <ControlTierOnboarding />;
  if (experience === 'simple') return <SimpleControlAppV2 />;
  if (experience === 'basic') return <BasicControlAppV1 />;
  if (experience === 'complete') return <CompleteControlAppV1 />;
  return <CentralFinanceiraV2 />;
}