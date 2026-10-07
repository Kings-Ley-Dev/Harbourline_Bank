import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { api, errMsg } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Field, PasswordField } from './ui.jsx';

export function ChangePassword() {
  const { t } = useTranslation();
  const [cur, setCur] = useState('');
  const [n1, setN1] = useState('');
  const [n2, setN2] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setMsg({});
    if (n1 !== n2) return setMsg({ kind: 'error', text: t('auth.mismatch') });
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: n1 } });
      setMsg({ kind: 'success', text: t('portal.security.pwdChanged') }); setCur(''); setN1(''); setN2('');
    } catch (e2) { setMsg({ kind: 'error', text: errMsg(e2, t('common.genericError')) }); }
    finally { setBusy(false); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h2>{t('portal.security.changePwd')}</h2>
      <Alert kind={msg.kind || 'error'}>{msg.text}</Alert>
      <PasswordField id="cp0" label={t('portal.security.current')} value={cur} onChange={setCur} />
      <PasswordField id="cp1" label={t('portal.security.new')} value={n1} onChange={setN1} autoComplete="new-password" hint={t('auth.rules')} />
      <PasswordField id="cp2" label={t('portal.security.confirm')} value={n2} onChange={setN2} autoComplete="new-password" />
      <button className="btn primary" disabled={busy}>{t('portal.security.update')}</button>
    </form>
  );
}

export function MfaPanel() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setMsg({}); setBusy(true);
    try {
      const d = await api('/auth/mfa/setup', { method: 'POST' });
      setSetup(d); setQr(await QRCode.toDataURL(d.otpauthUrl, { margin: 1, width: 200 }));
    } catch (e) { setMsg({ kind: 'error', text: errMsg(e, t('common.genericError')) }); }
    finally { setBusy(false); }
  };
  const enable = async (e) => {
    e.preventDefault(); setBusy(true); setMsg({});
    try { await api('/auth/mfa/enable', { method: 'POST', body: { code } }); setSetup(null); setCode(''); await refresh(); setMsg({ kind: 'success', text: t('portal.security.mfaEnabledMsg') }); }
    catch (e2) { setMsg({ kind: 'error', text: errMsg(e2, t('common.genericError')) }); }
    finally { setBusy(false); }
  };
  const disable = async (e) => {
    e.preventDefault(); setBusy(true); setMsg({});
    try { await api('/auth/mfa/disable', { method: 'POST', body: { password: pw, code } }); setDisabling(false); setCode(''); setPw(''); await refresh(); setMsg({ kind: 'success', text: t('portal.security.mfaDisabledMsg') }); }
    catch (e2) { setMsg({ kind: 'error', text: errMsg(e2, t('common.genericError')) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2>{t('portal.security.mfaTitle')}</h2>
      <Alert kind={msg.kind || 'error'}>{msg.text}</Alert>
      {user.mfaSetupRequired && <Alert kind="info">Multi-factor authentication is required for staff accounts. Set it up to continue.</Alert>}
      <p className="muted">{user.mfaEnabled ? t('portal.security.mfaOn') : t('portal.security.mfaOff')}</p>
      {!user.mfaEnabled && !setup && <button className="btn primary" onClick={start} disabled={busy}>{t('portal.security.mfaEnable')}</button>}
      {setup && (
        <form onSubmit={enable} className="mfa-setup">
          <p>{t('portal.security.mfaScan')}</p>
          {qr && <img src={qr} alt="QR code" width={200} height={200} className="qr" />}
          <p className="hint">{t('portal.security.mfaSecret')}: <code dir="ltr">{setup.secret}</code></p>
          <Field id="mc" label={t('auth.code')}><input id="mc" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,10}" required value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" className="code-input" maxLength={10} /></Field>
          <button className="btn primary" disabled={busy}>{t('portal.security.mfaConfirm')}</button>
        </form>
      )}
      {user.mfaEnabled && !disabling && user.role === 'client' && <button className="btn ghost" onClick={() => setDisabling(true)}>{t('portal.security.mfaDisable')}</button>}
      {disabling && (
        <form onSubmit={disable}>
          <p className="muted">{t('portal.security.mfaDisablePrompt')}</p>
          <PasswordField id="dp" label={t('auth.password')} value={pw} onChange={setPw} />
          <Field id="dc" label={t('auth.code')}><input id="dc" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" className="code-input" maxLength={10} /></Field>
          <div className="row"><button className="btn danger" disabled={busy}>{t('portal.security.mfaDisable')}</button><button type="button" className="btn ghost" onClick={() => setDisabling(false)}>{t('common.cancel')}</button></div>
        </form>
      )}
    </div>
  );
}
