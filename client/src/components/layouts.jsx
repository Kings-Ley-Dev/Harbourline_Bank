import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { Icon, Logo, LangSelect } from './ui.jsx';

const SERVICES = ['accounts', 'cards', 'loans', 'savings'];
const svcIcon = { accounts: 'acct', cards: 'card', loans: 'loan', savings: 'piggy' };

export function PublicLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [dd, setDd] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); setDd(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const home = user ? (user.role === 'client' ? '/portal' : '/admin') : '/login';

  return (
    <>
      <a className="skip" href="#main">{t('nav.skip')}</a>
      <header className="site-header">
        <div className="container bar">
          <Link to="/" className="brand" aria-label="Harbourline Bank"><Logo /></Link>
          <button className="menu-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mainnav" aria-label={t('nav.menu')}><Icon name={open ? 'x' : 'menu'} /></button>
          <nav id="mainnav" className={`mainnav ${open ? 'open' : ''}`} aria-label="Main">
            <div className={`dropdown ${dd ? 'open' : ''}`} onMouseEnter={() => window.innerWidth > 900 && setDd(true)} onMouseLeave={() => setDd(false)}>
              <button className="navlink dd-btn" aria-expanded={dd} onClick={() => setDd(!dd)}>{t('nav.banking')} <Icon name="chevron" size={16} /></button>
              <div className="dd-panel">
                {SERVICES.map((s) => (
                  <Link key={s} to={`/services/${s}`} className="dd-item"><Icon name={svcIcon[s]} /><span>{t(`nav.${s}`)}</span></Link>
                ))}
              </div>
            </div>
            <NavLink className="navlink" to="/security">{t('nav.security')}</NavLink>
            <NavLink className="navlink" to="/support">{t('nav.support')}</NavLink>
            <NavLink className="navlink" to="/contact">{t('nav.contact')}</NavLink>
            <div className="nav-actions">
              <LangSelect compact />
              {user ? (
                <>
                  <Link className="btn primary sm" to={home}>{user.role === 'client' ? t('nav.myAccounts') : t('nav.staff')}</Link>
                  <button className="btn ghost sm" onClick={logout}>{t('nav.logout')}</button>
                </>
              ) : (
                <>
                  <Link className="navlink subtle" to="/activate">{t('nav.activate')}</Link>
                  <Link className="btn primary sm" to="/login"><Icon name="lock" size={16} /> {t('nav.login')}</Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>
      <main id="main"><Outlet /></main>
      <footer className="site-footer">
        <div className="container foot-grid">
          <div>
            <Logo light />
            <p className="foot-tag">{t('footer.tagline')}</p>
          </div>
          <div>
            <h3>{t('footer.banking')}</h3>
            <ul>{SERVICES.map((s) => <li key={s}><Link to={`/services/${s}`}>{t(`nav.${s}`)}</Link></li>)}</ul>
          </div>
          <div>
            <h3>{t('footer.help')}</h3>
            <ul>
              <li><Link to="/security">{t('nav.security')}</Link></li>
              <li><Link to="/support">{t('nav.support')}</Link></li>
              <li><Link to="/contact">{t('nav.contact')}</Link></li>
              <li><Link to="/admin/login">{t('auth.staffLink')}</Link></li>
            </ul>
          </div>
          <div>
            <h3>{t('footer.legal')}</h3>
            <ul><li><a href="#main" onClick={(e) => e.preventDefault()}>{t('footer.terms')}</a></li><li><a href="#main" onClick={(e) => e.preventDefault()}>{t('footer.privacy')}</a></li></ul>
          </div>
        </div>
        <div className="container foot-base"><p>{t('footer.rights', { year: new Date().getFullYear() })}</p></div>
      </footer>
    </>
  );
}

function Shell({ items, title, children, badge }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const doLogout = async () => { await logout(); nav('/'); };
  return (
    <div className="shell">
      <a className="skip" href="#content">{t('nav.skip')}</a>
      <aside className={`side ${open ? 'open' : ''}`}>
        <Link to="/" className="side-logo"><Logo light /></Link>
        <p className="side-title">{title}</p>
        <nav aria-label={title}>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="side-link">
              <Icon name={i.icon} /> <span>{i.label}</span>
              {i.badge ? <em className="count">{i.badge}</em> : null}
            </NavLink>
          ))}
        </nav>
        <button className="side-link out" onClick={doLogout}><Icon name="out" /> <span>{t('nav.logout')}</span></button>
      </aside>
      <div className="shell-main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setOpen(!open)} aria-label={t('nav.menu')} aria-expanded={open}><Icon name={open ? 'x' : 'menu'} /></button>
          <div className="top-right">
            <LangSelect compact />
            {badge}
            <span className="who"><Icon name="user" size={18} /> {user?.name || user?.email}</span>
          </div>
        </div>
        <div id="content" className="content">{children}</div>
      </div>
    </div>
  );
}

export function PortalLayout() {
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  useEffect(() => { api('/client/notifications').then((d) => setUnread(d.unread)).catch(() => {}); }, [loc.pathname]);
  const items = [
    { to: '/portal', end: true, icon: 'home', label: t('portal.nav.dashboard') },
    { to: '/portal/accounts', icon: 'wallet', label: t('portal.nav.accounts') },
    { to: '/portal/transactions', icon: 'list', label: t('portal.nav.transactions') },
    { to: '/portal/statements', icon: 'doc', label: t('portal.nav.statements') },
    { to: '/portal/notifications', icon: 'bell', label: t('portal.nav.notifications'), badge: unread || null },
    { to: '/portal/profile', icon: 'user', label: t('portal.nav.profile') },
    { to: '/portal/security', icon: 'lock', label: t('portal.nav.security') },
    { to: '/portal/settings', icon: 'gear', label: t('portal.nav.settings') },
  ];
  return <Shell items={items} title={t('nav.myAccounts')}><Outlet /></Shell>;
}

export function AdminLayout() {
  const { user } = useAuth();
  const can = (p) => user.role === 'super_admin' || user.permissions.includes(p);
  const items = [
    can('clients:read') && { to: '/admin', end: true, icon: 'home', label: 'Dashboard' },
    can('clients:read') && { to: '/admin/clients', icon: 'users', label: 'Clients' },
    user.role === 'super_admin' && { to: '/admin/staff', icon: 'shield', label: 'Staff & roles' },
    can('audit:read') && { to: '/admin/audit', icon: 'log', label: 'Audit logs' },
    { to: '/admin/security', icon: 'lock', label: 'My security' },
  ].filter(Boolean);
  return <Shell items={items} title={user.role === 'super_admin' ? 'Super admin' : 'Staff portal'}><Outlet /></Shell>;
}
