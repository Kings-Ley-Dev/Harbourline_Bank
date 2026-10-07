import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth.jsx';
import { api, errMsg } from '../../api.js';
import { AuthCard, Alert, Field, PasswordField } from '../../components/ui.jsx';

export function Login({ portal = 'client' }) {
  const { t } = useTranslation();
  const { login, user, sessionExpired, clearExpired } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const staff = portal === 'admin';

  useEffect(() => {
    if (user) nav(user.role === 'client' ? '/portal' : (user.mfaSetupRequired ? '/admin/security' : '/admin'), { replace: true });
  }, [user, nav]);
  useEffect(() => () => clearExpired(), [clearExpired]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await login(email.trim(), password, portal, mfa ? code : undefined);
      if (r.mfaRequired) setMfa(true);
    } catch (e2) {
      setErr(errMsg(e2, t('common.genericError')));
      if (e2.code === 'INVALID_MFA_CODE') setCode('');
    } finally { setBusy(false); }
  };

  return (
    <AuthCard
      title={mfa ? t('auth.mfaTitle') : staff ? t('auth.staffTitle') : t('auth.loginTitle')}
      sub={mfa ? t('auth.mfaPrompt') : staff ? t('auth.staffSub') : t('auth.loginSub')}
      footer={<>
        {!staff && <Link to="/activate">{t('auth.notActivated')}</Link>}
        {staff ? <Link to="/login">{t('auth.clientLink')}</Link> : <Link to="/admin/login">{t('auth.staffLink')}</Link>}
      </>}
    >
      <Alert kind="info">{sessionExpired && !err ? t('auth.sessionExpired') : ''}</Alert>
      <Alert>{err}</Alert>
      <form onSubmit={submit} noValidate={false}>
        {!mfa ? (
          <>
            <Field id="email" label={t('auth.email')}><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={150} autoFocus /></Field>
            <PasswordField id="password" label={t('auth.password')} value={password} onChange={setPassword} />
            <p className="right"><Link to="/forgot-password">{t('auth.forgot')}</Link></p>
          </>
        ) : (
          <Field id="code" label={t('auth.code')}><input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,10}" required value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} autoFocus dir="ltr" className="code-input" /></Field>
        )}
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? t('auth.signingIn') : mfa ? t('auth.verify') : t('auth.signIn')}</button>
      </form>
    </AuthCard>
  );
}

export function Activate() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') || '';
  const [info, setInfo] = useState(null);
  const [state, setState] = useState(token ? 'checking' : 'none');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [paste, setPaste] = useState('');

  useEffect(() => {
    if (!token) return;
    api('/auth/activate', { params: { token } }).then((d) => { setInfo(d); setState('ok'); }).catch(() => setState('invalid'));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw !== pw2) return setErr(t('auth.mismatch'));
    setBusy(true);
    try { await api('/auth/activate', { method: 'POST', body: { token, password: pw } }); setDone(true); }
    catch (e2) { setErr(errMsg(e2, t('common.genericError'))); }
    finally { setBusy(false); }
  };
  const usePasted = (e) => {
    e.preventDefault();
    let tk = paste.trim();
    try { tk = new URL(tk).searchParams.get('token') || tk; } catch { /* plain token */ }
    if (tk) nav(`/activate?token=${encodeURIComponent(tk)}`);
  };

  if (done) return <AuthCard title={t('auth.activateTitle')}><Alert kind="success">{t('auth.activated')}</Alert><Link className="btn primary block" to="/login">{t('auth.goLogin')}</Link></AuthCard>;
  if (state === 'checking') return <AuthCard title={t('auth.activateTitle')}><p className="muted">{t('common.loading')}</p></AuthCard>;
  if (state === 'invalid') return <AuthCard title={t('auth.activateTitle')}><Alert>{t('auth.activateInvalid')}</Alert><Link className="btn ghost block" to="/contact">{t('nav.contact')}</Link></AuthCard>;
  if (state === 'none') {
    return (
      <AuthCard title={t('auth.activateTitle')} sub={t('support.a1')}>
        <form onSubmit={usePasted}>
          <Field id="paste" label={t('auth.activationLink')}><input id="paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://…/activate?token=…" dir="ltr" required /></Field>
          <button className="btn primary block" type="submit">{t('common.next')}</button>
        </form>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.activateTitle')} sub={t('auth.activateHello', { name: info.name, email: info.email })}>
      <Alert>{err}</Alert>
      <form onSubmit={submit}>
        <PasswordField id="np" label={t('auth.newPassword')} value={pw} onChange={setPw} autoComplete="new-password" hint={t('auth.rules')} />
        <PasswordField id="np2" label={t('auth.confirmPassword')} value={pw2} onChange={setPw2} autoComplete="new-password" />
        <button className="btn primary block" disabled={busy}>{t('auth.activateBtn')}</button>
      </form>
    </AuthCard>
  );
}

export function Forgot() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim() } }); setSent(true); }
    catch (e2) { setErr(errMsg(e2, t('common.genericError'))); }
    finally { setBusy(false); }
  };
  return (
    <AuthCard title={t('auth.forgotTitle')} sub={t('auth.forgotSub')} footer={<Link to="/login">{t('auth.goLogin')}</Link>}>
      <Alert>{err}</Alert>
      {sent ? <Alert kind="success">{t('auth.forgotSent')}</Alert> : (
        <form onSubmit={submit}>
          <Field id="fe" label={t('auth.email')}><input id="fe" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={150} autoFocus /></Field>
          <button className="btn primary block" disabled={busy}>{t('auth.sendLink')}</button>
        </form>
      )}
    </AuthCard>
  );
}

export function Reset() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (pw !== pw2) return setErr(t('auth.mismatch'));
    setBusy(true);
    try { await api('/auth/reset-password', { method: 'POST', body: { token, password: pw } }); setDone(true); }
    catch (e2) { setErr(e2.code === 'INVALID_TOKEN' ? t('auth.invalidReset') : errMsg(e2, t('common.genericError'))); }
    finally { setBusy(false); }
  };
  if (done) return <AuthCard title={t('auth.resetTitle')}><Alert kind="success">{t('auth.resetDone')}</Alert><Link className="btn primary block" to="/login">{t('auth.goLogin')}</Link></AuthCard>;
  if (!token) return <AuthCard title={t('auth.resetTitle')}><Alert>{t('auth.invalidReset')}</Alert><Link className="btn ghost block" to="/forgot-password">{t('auth.forgotTitle')}</Link></AuthCard>;
  return (
    <AuthCard title={t('auth.resetTitle')}>
      <Alert>{err}</Alert>
      <form onSubmit={submit}>
        <PasswordField id="rp" label={t('auth.newPassword')} value={pw} onChange={setPw} autoComplete="new-password" hint={t('auth.rules')} />
        <PasswordField id="rp2" label={t('auth.confirmPassword')} value={pw2} onChange={setPw2} autoComplete="new-password" />
        <button className="btn primary block" disabled={busy}>{t('auth.resetBtn')}</button>
      </form>
    </AuthCard>
  );
}
