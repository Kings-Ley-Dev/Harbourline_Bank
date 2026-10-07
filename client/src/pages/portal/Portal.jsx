import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errMsg } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { money, dateFmt, dateTimeFmt, monthLabel, countryName } from '../../format.js';
import { Alert, Icon, Pagination, Spinner, StatusBadge, Field } from '../../components/ui.jsx';
import { ChangePassword, MfaPanel } from '../../components/SecurityPanel.jsx';

function useLoad(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: '' });
  const load = useCallback(() => {
    set((s) => ({ ...s, loading: true, error: '' }));
    fn().then((data) => set({ loading: false, data, error: '' })).catch((e) => set({ loading: false, data: null, error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

const Head = ({ title, children }) => <div className="page-head"><h1>{title}</h1><div className="head-actions">{children}</div></div>;

const AccountCard = ({ a }) => {
  const { t } = useTranslation();
  return (
    <div className="acct-card">
      <div className="acct-top"><span className="acct-type">{t(`accountTypes.${a.type}`)}</span><StatusBadge status={a.status} /></div>
      <div className="acct-num" dir="ltr">•••• {a.accountNumber.slice(-4)}</div>
      <div className="acct-bal">{money(a.balance, a.currency)}</div>
      <div className="acct-sub">{t('portal.accounts.available')}</div>
    </div>
  );
};

export const TxTable = ({ items, accounts }) => {
  const { t } = useTranslation();
  const accMap = useMemo(() => Object.fromEntries((accounts || []).map((a) => [a.id, a])), [accounts]);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>{t('portal.tx.date')}</th><th>{t('portal.tx.description')}</th><th className="num">{t('portal.tx.amount')}</th><th className="num hide-sm">{t('portal.tx.balance')}</th></tr></thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id}>
              <td data-label={t('portal.tx.date')}>{dateFmt(x.createdAt)}</td>
              <td data-label={t('portal.tx.description')}><b>{x.description}</b><small className="sub" dir="ltr">{x.reference}{accMap[x.accountId] ? ` · •••• ${accMap[x.accountId].accountNumber.slice(-4)}` : ''}</small></td>
              <td data-label={t('portal.tx.amount')} className={`num ${x.type === 'credit' ? 'pos' : 'neg'}`} dir="ltr">{x.type === 'credit' ? '+' : '−'}{money(x.amount, x.currency)}</td>
              <td data-label={t('portal.tx.balance')} className="num hide-sm" dir="ltr">{x.balanceAfter != null ? money(x.balanceAfter, x.currency) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const acc = useLoad(() => api('/client/accounts'), []);
  const tx = useLoad(() => api('/client/transactions', { params: { limit: 6 } }), []);
  const notif = useLoad(() => api('/client/notifications'), []);
  const totals = useMemo(() => {
    const m = {};
    (acc.data?.items || []).forEach((a) => { m[a.currency] = (m[a.currency] || 0) + a.balance; });
    return Object.entries(m);
  }, [acc.data]);
  return (
    <>
      <Head title={t('portal.greeting', { name: user.client?.firstName || user.name })}>
        <span className="chip"><Icon name="user" size={16} /> {t('portal.customerId')}: <b dir="ltr">{user.client?.customerId}</b></span>
      </Head>
      {notif.data?.unread > 0 && <Link to="/portal/notifications" className="notice"><Icon name="bell" /> {t('portal.dashboard.unread', { count: notif.data.unread })}</Link>}
      {acc.loading ? <Spinner label={t('common.loading')} /> : acc.error ? <Alert>{acc.error}</Alert> : (
        <>
          <div className="total-card">
            <span>{t('portal.dashboard.totalBalance')}</span>
            <div className="total-vals">{totals.map(([c, v]) => <b key={c} dir="ltr">{money(v, c)}</b>)}</div>
          </div>
          <h2 className="h-sm">{t('portal.dashboard.myAccounts')}</h2>
          <div className="acct-grid">{acc.data.items.map((a) => <AccountCard key={a.id} a={a} />)}</div>
        </>
      )}
      <div className="h-row"><h2 className="h-sm">{t('portal.dashboard.recent')}</h2><Link to="/portal/transactions" className="more">{t('portal.dashboard.viewAll')} <Icon name="arrow" size={16} className="flip" /></Link></div>
      {tx.loading ? <Spinner label={t('common.loading')} /> : tx.data?.items?.length ? <TxTable items={tx.data.items} accounts={acc.data?.items} /> : <p className="empty">{t('portal.dashboard.none')}</p>}
    </>
  );
}

export function Accounts() {
  const { t } = useTranslation();
  const acc = useLoad(() => api('/client/accounts'), []);
  return (
    <>
      <Head title={t('portal.nav.accounts')} />
      {acc.loading ? <Spinner label={t('common.loading')} /> : acc.error ? <Alert>{acc.error}</Alert> : !acc.data.items.length ? <p className="empty">{t('portal.accounts.noAccounts')}</p> : (
        <div className="stack">
          {acc.data.items.map((a) => (
            <div className="card" key={a.id}>
              <div className="split"><div><h2>{t(`accountTypes.${a.type}`)}</h2><p className="muted" dir="ltr">{a.accountNumber}</p></div><div className="big-amt" dir="ltr">{money(a.balance, a.currency)}</div></div>
              <dl className="kv">
                <div><dt>{t('portal.accounts.number')}</dt><dd dir="ltr">{a.accountNumber}</dd></div>
                <div><dt>{t('portal.accounts.reference')}</dt><dd dir="ltr">{a.reference}</dd></div>
                <div><dt>{t('portal.accounts.currency')}</dt><dd>{a.currency}</dd></div>
                <div><dt>{t('portal.accounts.status')}</dt><dd><StatusBadge status={a.status} /></dd></div>
              </dl>
              <Link className="btn ghost sm" to={`/portal/transactions?account=${a.id}`}>{t('portal.nav.transactions')}</Link>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Transactions() {
  const { t } = useTranslation();
  const [f, setF] = useState({ accountId: new URLSearchParams(window.location.search).get('account') || '', type: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const accs = useLoad(() => api('/client/accounts'), []);
  const tx = useLoad(() => api('/client/transactions', { params: { ...f, page, limit: 15 } }), [f.accountId, f.type, f.from, f.to, f.q, page]);
  const [q, setQ] = useState('');
  useEffect(() => { const id = setTimeout(() => { setF((s) => (s.q === q ? s : { ...s, q })); setPage(1); }, 350); return () => clearTimeout(id); }, [q]);
  const set = (k, v) => { setF((s) => ({ ...s, [k]: v })); setPage(1); };
  const clear = () => { setF({ accountId: '', type: '', q: '', from: '', to: '' }); setQ(''); setPage(1); };
  const exportCsv = () => { window.location.href = '/api/client/transactions?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), format: 'csv' }); };
  return (
    <>
      <Head title={t('portal.tx.title')}><button className="btn ghost sm" onClick={exportCsv}><Icon name="download" size={16} /> {t('portal.tx.export')}</button></Head>
      <div className="filters card">
        <Field id="fa" label={t('portal.tx.account')}>
          <select id="fa" value={f.accountId} onChange={(e) => set('accountId', e.target.value)}>
            <option value="">{t('portal.tx.allAccounts')}</option>
            {(accs.data?.items || []).map((a) => <option key={a.id} value={a.id}>{t(`accountTypes.${a.type}`)} •••• {a.accountNumber.slice(-4)}</option>)}
          </select>
        </Field>
        <Field id="ft" label=" ">
          <div className="seg" role="group">
            {[['', 'all'], ['credit', 'credits'], ['debit', 'debits']].map(([v, k]) => <button key={k} type="button" className={f.type === v ? 'on' : ''} aria-pressed={f.type === v} onClick={() => set('type', v)}>{t(`portal.tx.${k}`)}</button>)}
          </div>
        </Field>
        <Field id="ff" label={t('portal.tx.from')}><input id="ff" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></Field>
        <Field id="ftt" label={t('portal.tx.to')}><input id="ftt" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></Field>
        <Field id="fq" label={t('portal.tx.search')}><input id="fq" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} /></Field>
      </div>
      {tx.loading ? <Spinner label={t('common.loading')} /> : tx.error ? <Alert>{tx.error}</Alert> : tx.data.items.length ? (
        <><TxTable items={tx.data.items} accounts={accs.data?.items} /><Pagination page={tx.data.page} pages={tx.data.pages} onPage={setPage} /></>
      ) : <div className="empty"><p>{t('portal.tx.none')}</p><button className="btn ghost sm" onClick={clear}>{t('portal.tx.clear')}</button></div>}
    </>
  );
}

export function Statements() {
  const { t } = useTranslation();
  const accs = useLoad(() => api('/client/accounts'), []);
  const now = new Date().toISOString().slice(0, 7);
  const [accountId, setAccountId] = useState('');
  const [month, setMonth] = useState(now);
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!accountId && accs.data?.items?.[0]) setAccountId(accs.data.items[0].id); }, [accs.data, accountId]);
  const run = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { setSt((await api('/client/statements', { params: { accountId, month } })).statement); }
    catch (e2) { setErr(e2.code === 'NOT_ENABLED' ? t('portal.statements.disabled') : errMsg(e2, t('common.genericError'))); setSt(null); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Head title={t('portal.statements.title')} />
      <form className="card filters no-print" onSubmit={run}>
        <p className="muted wide-col">{t('portal.statements.intro')}</p>
        <Field id="sa" label={t('portal.tx.account')}>
          <select id="sa" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            {(accs.data?.items || []).map((a) => <option key={a.id} value={a.id}>{t(`accountTypes.${a.type}`)} •••• {a.accountNumber.slice(-4)}</option>)}
          </select>
        </Field>
        <Field id="sm" label={t('portal.statements.month')}><input id="sm" type="month" value={month} max={now} onChange={(e) => setMonth(e.target.value)} required /></Field>
        <Field id="sb" label=" "><button className="btn primary" disabled={busy}>{t('portal.statements.generate')}</button></Field>
      </form>
      <Alert>{err}</Alert>
      {st && (
        <article className="statement card">
          <header className="split">
            <div><h2>{t('portal.statements.title')} · {monthLabel(st.month)}</h2><p className="muted">{t(`accountTypes.${st.account.type}`)} · <span dir="ltr">{st.account.accountNumber}</span></p></div>
            <button className="btn ghost sm no-print" onClick={() => window.print()}>{t('portal.statements.print')}</button>
          </header>
          <dl className="kv four">
            <div><dt>{t('portal.statements.opening')}</dt><dd dir="ltr">{money(st.openingBalance, st.account.currency)}</dd></div>
            <div><dt>{t('portal.statements.credits')}</dt><dd className="pos" dir="ltr">+{money(st.totalCredits, st.account.currency)}</dd></div>
            <div><dt>{t('portal.statements.debits')}</dt><dd className="neg" dir="ltr">−{money(st.totalDebits, st.account.currency)}</dd></div>
            <div><dt>{t('portal.statements.closing')}</dt><dd dir="ltr"><b>{money(st.closingBalance, st.account.currency)}</b></dd></div>
          </dl>
          {st.transactions.length ? <TxTable items={st.transactions} accounts={[st.account]} /> : <p className="empty">{t('portal.tx.none')}</p>}
        </article>
      )}
    </>
  );
}

export function Notifications() {
  const { t } = useTranslation();
  const n = useLoad(() => api('/client/notifications'), []);
  const readAll = async () => { await api('/client/notifications/read-all', { method: 'POST' }); n.reload(); };
  const read = async (id) => { await api(`/client/notifications/${id}/read`, { method: 'PATCH' }); n.reload(); };
  return (
    <>
      <Head title={t('portal.notifications.title')}>{n.data?.unread > 0 && <button className="btn ghost sm" onClick={readAll}>{t('portal.notifications.markAll')}</button>}</Head>
      {n.loading ? <Spinner label={t('common.loading')} /> : n.error ? <Alert>{n.error}</Alert> : !n.data.items.length ? <p className="empty">{t('portal.notifications.none')}</p> : (
        <ul className="notif-list">
          {n.data.items.map((x) => (
            <li key={x.id} className={x.read ? '' : 'unread'}>
              <span className="dot" aria-hidden="true" />
              <div><b>{x.title}</b><p>{x.body}</p><small>{dateTimeFmt(x.createdAt)}</small></div>
              {!x.read && <button className="btn sm ghost" onClick={() => read(x.id)}>{t('portal.notifications.new')} ✓</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Profile() {
  const { t } = useTranslation();
  const p = useLoad(() => api('/client/profile'), []);
  const d = p.data?.profile;
  return (
    <>
      <Head title={t('portal.profile.title')} />
      {p.loading ? <Spinner label={t('common.loading')} /> : p.error ? <Alert>{p.error}</Alert> : (
        <div className="card">
          <dl className="kv two">
            <div><dt>{t('portal.profile.name')}</dt><dd>{d.firstName} {d.lastName}</dd></div>
            <div><dt>{t('portal.customerId')}</dt><dd dir="ltr">{d.customerId}</dd></div>
            <div><dt>{t('portal.profile.email')}</dt><dd dir="ltr">{d.email}</dd></div>
            <div><dt>{t('portal.profile.phone')}</dt><dd dir="ltr">{d.phone}</dd></div>
            <div><dt>{t('portal.profile.country')}</dt><dd>{countryName(d.country)}</dd></div>
            <div><dt>{t('portal.profile.status')}</dt><dd><StatusBadge status={d.status} /></dd></div>
            <div><dt>{t('portal.profile.since')}</dt><dd>{dateFmt(d.memberSince)}</dd></div>
            <div><dt>{t('portal.lastLogin')}</dt><dd>{dateTimeFmt(d.lastLoginAt)}</dd></div>
          </dl>
          <p className="hint">{t('portal.profile.note')}</p>
        </div>
      )}
    </>
  );
}

export function SecurityPage() {
  const { t } = useTranslation();
  return (<><Head title={t('portal.security.title')} /><div className="two-col"><ChangePassword /><MfaPanel /></div></>);
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { setLanguage } = useAuth();
  const [saved, setSaved] = useState(false);
  const cur = (i18n.resolvedLanguage || 'en').slice(0, 2);
  const langs = [['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['ar', 'العربية']];
  const pick = async (c) => { await setLanguage(c); setSaved(true); };
  return (
    <>
      <Head title={t('portal.settings.title')} />
      <div className="card">
        <h2>{t('portal.settings.langTitle')}</h2>
        <p className="muted">{t('portal.settings.langText')}</p>
        <Alert kind="success">{saved ? t('portal.settings.saved') : ''}</Alert>
        <div className="lang-grid" role="radiogroup" aria-label={t('portal.settings.langTitle')}>
          {langs.map(([c, n]) => <button key={c} role="radio" aria-checked={cur === c} className={`lang-opt ${cur === c ? 'on' : ''}`} onClick={() => pick(c)} lang={c}>{n}{cur === c && <Icon name="check" size={18} />}</button>)}
        </div>
      </div>
    </>
  );
}
