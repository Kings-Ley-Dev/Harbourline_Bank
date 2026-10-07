import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGS } from '../i18n/index.js';
import { useAuth } from '../auth.jsx';

const paths = {
  wallet: 'M3 7a2 2 0 0 1 2-2h13v3M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2M16 13.5h.01',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  help: 'M12 17h.01M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2c3 3 4 6.5 4 10s-1 7-4 10c-3-3-4-6.5-4-10s1-7 4-10z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  loan: 'M12 2v20M17 6.5C16 5 14.5 4.5 12 4.5c-3 0-5 1.3-5 3.5 0 5 10 2.5 10 7.5 0 2.2-2 3.5-5 3.5-2.5 0-4.5-.7-5.5-2.5',
  piggy: 'M5 11a7 7 0 0 1 7-6h3l2 2h2v4l-2 1v3a2 2 0 0 1-2 2h-2v-2h-4v2H8a2 2 0 0 1-2-2v-2M16 10h.01M12 5V3',
  acct: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  log: 'M9 3h6l4 4v14H5V3zM9 12h6M9 16h6M9 8h2',
  out: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12M7 11l5 5 5-5M5 21h14',
  chevron: 'M6 9l6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 6l12 12M18 6L6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 13l4 4L19 7',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  mail: 'M3 5h18v14H3zM3 7l9 6 9-6',
  pin: 'M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  up: 'M7 17L17 7M9 7h8v8',
  down: 'M17 7L7 17M15 17H7V9',
};

export const Icon = ({ name, size = 20, className = '' }) => (
  <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name] || ''} />
  </svg>
);

export const Logo = ({ light = false }) => (
  <span className={`logo ${light ? 'logo-light' : ''}`}>
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill={light ? '#ffffff' : '#0b2545'} />
      <path d="M10 40c8-8 14-8 22 0s14 8 22 0" fill="none" stroke="#14b8a6" strokeWidth="5" strokeLinecap="round" />
      <path d="M10 28c8-8 14-8 22 0s14 8 22 0" fill="none" stroke={light ? '#0b2545' : '#ffffff'} strokeWidth="5" strokeLinecap="round" />
    </svg>
    <span className="logo-text">Harbourline<small>Bank</small></span>
  </span>
);

export const Spinner = ({ label }) => (
  <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}</span></div>
);

export const Alert = ({ kind = 'error', children, onClose }) =>
  children ? (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button type="button" className="alert-x" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>}
    </div>
  ) : null;

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  const tone = { active: 'ok', completed: 'ok', pending: 'warn', suspended: 'bad', frozen: 'bad', closed: 'muted', failed: 'bad', reversed: 'muted', sent: 'ok', skipped: 'muted', queued: 'warn' }[status] || 'muted';
  const label = t(`status.${status}`, { defaultValue: status });
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export function Pagination({ page, pages, onPage }) {
  const { t } = useTranslation();
  if (!pages || pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('common.previous')}</button>
      <span>{t('common.page', { page, pages })}</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.next')}</button>
    </nav>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, id }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && <p className="field-err">{error}</p>}
    </div>
  );
}

export function PasswordField({ id, label, value, onChange, autoComplete = 'current-password', hint, required = true }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <Field id={id} label={label} hint={hint}>
      <div className="pw">
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} maxLength={200} />
        <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-pressed={show}>{show ? t('common.hide') : t('common.show')}</button>
      </div>
    </Field>
  );
}

export function LangSelect({ compact }) {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useAuth();
  const cur = (i18n.resolvedLanguage || 'en').slice(0, 2);
  return (
    <label className={`lang ${compact ? 'compact' : ''}`}>
      <Icon name="globe" size={18} />
      <span className="sr">{t('common.language')}</span>
      <select value={cur} onChange={(e) => setLanguage(e.target.value)} aria-label={t('common.language')}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}

export const AuthCard = ({ title, sub, children, footer }) => (
  <div className="auth-wrap">
    <div className="auth-card">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
      {children}
      {footer && <div className="auth-foot">{footer}</div>}
    </div>
  </div>
);
