import { useCallback, useEffect, useState } from 'react';   
import { Link, useNavigate, useParams } from 'react-router-dom'; 
import { api, errMsg } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { money, dateTimeFmt, dateFmt, COUNTRIES, CURRENCIES, countryName } from '../../format.js';
import { LANGS } from '../../i18n/index.js';
import { Alert, Field, Icon, Modal, Pagination, Spinner, StatusBadge } from '../../components/ui.jsx';
import { ChangePassword, MfaPanel } from '../../components/SecurityPanel.jsx';

function useLoad(fn, deps) {
  const [s, set] = useState({ loading: true, data: null, error: '' });
  const load = useCallback(() => {
    set((x) => ({ ...x, loading: true, error: '' }));
    fn().then((data) => set({ loading: false, data, error: '' })).catch((e) => set({ loading: false, data: null, error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { ...s, reload: load };
}
const useCan = () => { const { user } = useAuth(); return (p) => user.role === 'super_admin' || user.permissions.includes(p); };
const Head = ({ title, children }) => <div className="page-head"><h1>{title}</h1><div className="head-actions">{children}</div></div>;
const langName = (c) => LANGS.find((l) => l.code === c)?.label || c;

export function AdminDashboard() {
  const st = useLoad(() => api('/admin/stats'), []);
  const can = useCan();
  const d = st.data;
  return (
    <>
      <Head title="Dashboard">{can('clients:create') && <Link className="btn primary sm" to="/admin/clients?new=1"><Icon name="plus" size={16} /> New client</Link>}</Head>
      {st.loading ? <Spinner label="Loading…" /> : st.error ? <Alert>{st.error}</Alert> : (
        <>
          <div className="stat-grid">
            <div className="stat"><span>Total clients</span><b>{d.clients.total}</b></div>
            <div className="stat ok"><span>Active</span><b>{d.clients.active}</b></div>
            <div className="stat warn"><span>Pending activation</span><b>{d.clients.pending}</b></div>
            <div className="stat bad"><span>Suspended</span><b>{d.clients.suspended}</b></div>
            <div className="stat"><span>Notifications sent (7d)</span><b>{d.notifications7d.sent}</b></div>
            <div className={`stat ${d.notifications7d.failed ? 'bad' : ''}`}><span>Delivery failures (7d)</span><b>{d.notifications7d.failed}</b></div>
          </div>
          <h2 className="h-sm">Recently added clients</h2>
          <div className="table-wrap"><table className="table"><thead><tr><th>Client</th><th>Customer ID</th><th>Status</th><th>Added</th></tr></thead><tbody>
            {d.recentClients.map((c) => <tr key={c.id}><td data-label="Client"><Link to={`/admin/clients/${c.id}`}><b>{c.firstName} {c.lastName}</b></Link><small className="sub">{c.email}</small></td><td data-label="Customer ID" dir="ltr">{c.customerId}</td><td data-label="Status"><StatusBadge status={c.status} /></td><td data-label="Added">{dateFmt(c.createdAt)}</td></tr>)}
            {!d.recentClients.length && <tr><td colSpan={4} className="empty">No clients yet.</td></tr>}
          </tbody></table></div>
        </>
      )}
    </>
  );
}

function NewClientModal({ onClose, onCreated }) {
  const can = useCan();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '+233', country: 'GH', preferredLanguage: 'en', customerId: '', status: 'pending', accType: 'current', currency: 'GHS', opening: '' });
  const [ch, setCh] = useState({ email: true, whatsapp: true, sms: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const body = {
        firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone.replace(/[\s-]/g, ''), country: f.country, preferredLanguage: f.preferredLanguage,
        status: f.status, ...(f.customerId ? { customerId: f.customerId } : {}),
        initialAccount: { type: f.accType, currency: f.currency, openingBalance: f.opening ? Number(f.opening) : 0 },
        channels: Object.keys(ch).filter((k) => ch[k]),
      };
      setResult(await api('/admin/clients', { method: 'POST', body })); onCreated();
    } catch (e2) { setErr(errMsg(e2, 'Could not create client.')); }
    finally { setBusy(false); }
  };
  if (result) {
    return (
      <Modal title="Client created" onClose={onClose}>
        <Alert kind="success">{result.client.firstName} {result.client.lastName} ({result.client.customerId}) has been created.</Alert>
        {result.notifications.length > 0 && <><h3 className="h-sm">Notification delivery</h3><NotifTable items={result.notifications} /></>}
        {result.devActivationUrl && <div className="dev-box"><b>Development only</b><p>No providers are configured, so use this one-time activation link directly:</p><code dir="ltr">{result.devActivationUrl}</code></div>}
        <div className="row mt"><Link className="btn primary" to={`/admin/clients/${result.client.id}`}>Open client</Link><button className="btn ghost" onClick={onClose}>Close</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Create client account" onClose={onClose} wide>
      <form onSubmit={submit}>
        <Alert>{err}</Alert>
        <div className="form-grid">
          <Field id="n1" label="First name"><input id="n1" required value={f.firstName} onChange={set('firstName')} maxLength={80} autoFocus /></Field>
          <Field id="n2" label="Last name"><input id="n2" required value={f.lastName} onChange={set('lastName')} maxLength={80} /></Field>
          <Field id="n3" label="Email"><input id="n3" type="email" required value={f.email} onChange={set('email')} maxLength={150} /></Field>
          <Field id="n4" label="Mobile (international format)" hint="Used for SMS and WhatsApp, e.g. +233241234567"><input id="n4" required value={f.phone} onChange={set('phone')} pattern="\+[1-9][0-9 \-]{7,18}" dir="ltr" /></Field>
          <Field id="n5" label="Country"><select id="n5" value={f.country} onChange={set('country')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
          <Field id="n6" label="Preferred language"><select id="n6" value={f.preferredLanguage} onChange={set('preferredLanguage')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></Field>
          <Field id="n7" label="Customer ID / reference" hint="Leave blank to auto-generate"><input id="n7" value={f.customerId} onChange={set('customerId')} maxLength={20} dir="ltr" /></Field>
          <Field id="n8" label="Initial status"><select id="n8" value={f.status} onChange={set('status')}><option value="pending">Pending activation (send invite)</option><option value="suspended">Suspended (no invite)</option></select></Field>
          <Field id="n9" label="Initial account"><select id="n9" value={f.accType} onChange={set('accType')}><option value="current">Current</option><option value="savings">Savings</option><option value="fixed_deposit">Fixed deposit</option></select></Field>
          <Field id="n10" label="Currency"><select id="n10" value={f.currency} onChange={set('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          {can('transactions:write') && <Field id="n11" label="Opening deposit (optional)"><input id="n11" type="number" min="0" step="0.01" value={f.opening} onChange={set('opening')} dir="ltr" /></Field>}
        </div>
        {f.status === 'pending' && (
          <fieldset className="chk"><legend>Send activation invitation via</legend>
            {['email', 'whatsapp', 'sms'].map((k) => <label key={k}><input type="checkbox" checked={ch[k]} onChange={(e) => setCh({ ...ch, [k]: e.target.checked })} /> {k === 'sms' ? 'SMS' : k === 'whatsapp' ? 'WhatsApp' : 'Email'}</label>)}
            <p className="hint">The client receives a one-time activation link and chooses their own password. Passwords are never sent.</p>
          </fieldset>
        )}
        <div className="row mt"><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create client'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

const NotifTable = ({ items }) => (
  <div className="table-wrap"><table className="table"><thead><tr><th>Channel</th><th>Recipient</th><th>Template</th><th>Status</th><th>When</th></tr></thead><tbody>
    {items.map((n) => (
      <tr key={n.id}><td data-label="Channel">{n.channel === 'sms' ? 'SMS' : n.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</td><td data-label="Recipient" dir="ltr">{n.recipient}</td><td data-label="Template">{n.template}</td>
        <td data-label="Status"><StatusBadge status={n.status} />{n.providerResponse?.reason && <small className="sub">{n.providerResponse.reason}</small>}{n.providerResponse?.error && <small className="sub">{n.providerResponse.error}</small>}</td><td data-label="When">{dateTimeFmt(n.sentAt || n.createdAt)}</td></tr>
    ))}
  </tbody></table></div>
);

export function Clients() {
  const can = useCan();
  const nav = useNavigate();
  const [f, setF] = useState({ search: '', status: '', country: '', language: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(new URLSearchParams(window.location.search).get('new') === '1');
  useEffect(() => { const id = setTimeout(() => { setF((s) => ({ ...s, search: q })); setPage(1); }, 350); return () => clearTimeout(id); }, [q]);
  const list = useLoad(() => api('/admin/clients', { params: { ...f, page, limit: 15 } }), [f.search, f.status, f.country, f.language, page]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <>
      <Head title="Clients">{can('clients:create') && <button className="btn primary sm" onClick={() => setShowNew(true)}><Icon name="plus" size={16} /> New client</button>}</Head>
      <div className="filters card">
        <Field id="cs" label="Search"><input id="cs" type="search" placeholder="Name, email, phone, customer ID" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} /></Field>
        <Field id="cst" label="Status"><select id="cst" value={f.status} onChange={set('status')}><option value="">All</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></Field>
        <Field id="cc" label="Country"><select id="cc" value={f.country} onChange={set('country')}><option value="">All</option>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
        <Field id="cl" label="Language"><select id="cl" value={f.language} onChange={set('language')}><option value="">All</option>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></Field>
      </div>
      {list.loading ? <Spinner label="Loading…" /> : list.error ? <Alert>{list.error}</Alert> : (
        <>
          <p className="muted">{list.data.total} client(s)</p>
          <div className="table-wrap"><table className="table clickable"><thead><tr><th>Client</th><th>Customer ID</th><th>Country</th><th>Language</th><th>Status</th><th>Created</th></tr></thead><tbody>
            {list.data.items.map((c) => (
              <tr key={c.id} onClick={() => nav(`/admin/clients/${c.id}`)}>
                <td data-label="Client"><Link to={`/admin/clients/${c.id}`} onClick={(e) => e.stopPropagation()}><b>{c.firstName} {c.lastName}</b></Link><small className="sub">{c.email}</small></td>
                <td data-label="Customer ID" dir="ltr">{c.customerId}</td><td data-label="Country">{countryName(c.country)}</td><td data-label="Language">{langName(c.preferredLanguage)}</td>
                <td data-label="Status"><StatusBadge status={c.status} /></td><td data-label="Created">{dateFmt(c.createdAt)}</td>
              </tr>
            ))}
            {!list.data.items.length && <tr><td colSpan={6} className="empty">No clients match your filters.</td></tr>}
          </tbody></table></div>
          <Pagination page={list.data.page} pages={list.data.pages} onPage={setPage} />
        </>
      )}
      {showNew && <NewClientModal onClose={() => setShowNew(false)} onCreated={list.reload} />}
    </>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const can = useCan();
  const d = useLoad(() => api(`/admin/clients/${id}`), [id]);
  const [edit, setEdit] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [txModal, setTxModal] = useState(null);
  const [acctModal, setAcctModal] = useState(false);
  const [notifModal, setNotifModal] = useState(false);
  const act = async (fn, ok) => { setMsg({}); try { const r = await fn(); setMsg({ kind: 'success', text: ok }); d.reload(); return r; } catch (e) { setMsg({ kind: 'error', text: errMsg(e, 'Action failed.') }); } };
  if (d.loading && !d.data) return <Spinner label="Loading…" />;
  if (d.error) return <Alert>{d.error}</Alert>;
  const { client: c, accounts, transactions, notifications } = d.data;
  const accMap = Object.fromEntries(accounts.map((a) => [a.id, a]));
  return (
    <>
      <p className="crumb"><Link to="/admin/clients">← Clients</Link></p>
      <Head title={`${c.firstName} ${c.lastName}`}>
        <StatusBadge status={c.status} />
        {can('clients:update') && <button className="btn ghost sm" onClick={() => setEdit(true)}>Edit</button>}
        {can('clients:suspend') && c.status === 'active' && <button className="btn danger sm" onClick={() => window.confirm('Suspend this client? They will be signed out immediately.') && act(() => api(`/admin/clients/${id}`, { method: 'PATCH', body: { status: 'suspended' } }), 'Client suspended.')}>Suspend</button>}
        {can('clients:suspend') && c.status === 'suspended' && c.activated && <button className="btn primary sm" onClick={() => act(() => api(`/admin/clients/${id}`, { method: 'PATCH', body: { status: 'active' } }), 'Client reactivated.')}>Reactivate</button>}
      </Head>
      <Alert kind={msg.kind || 'error'} onClose={() => setMsg({})}>{msg.text}</Alert>
      <div className="card">
        <dl className="kv two">
          <div><dt>Customer ID</dt><dd dir="ltr">{c.customerId}</dd></div><div><dt>Email</dt><dd dir="ltr">{c.email}</dd></div>
          <div><dt>Mobile</dt><dd dir="ltr">{c.phone}</dd></div><div><dt>Country</dt><dd>{countryName(c.country)}</dd></div>
          <div><dt>Preferred language</dt><dd>{langName(c.preferredLanguage)}</dd></div><div><dt>Created</dt><dd>{dateTimeFmt(c.createdAt)}</dd></div>
          <div><dt>Last sign-in</dt><dd>{dateTimeFmt(c.lastLoginAt)}</dd></div><div><dt>MFA</dt><dd>{c.mfaEnabled ? 'Enabled' : 'Not enabled'}</dd></div>
        </dl>
        {can('clients:update') && c.mfaEnabled && <button className="btn ghost sm" onClick={() => window.confirm('Reset this client’s MFA? They will need to enrol again.') && act(() => api(`/admin/clients/${id}/reset-mfa`, { method: 'POST' }), 'MFA reset.')}>Reset MFA</button>}
      </div>

      <div className="h-row"><h2 className="h-sm">Accounts</h2>{can('accounts:manage') && <button className="btn ghost sm" onClick={() => setAcctModal(true)}><Icon name="plus" size={16} /> Add account</button>}</div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Type</th><th>Ref</th><th className="num">Balance</th><th>Status</th><th /></tr></thead><tbody>
        {accounts.map((a) => (
          <tr key={a.id}><td data-label="Account" dir="ltr">{a.accountNumber}</td><td data-label="Type">{a.type.replace('_', ' ')}</td><td data-label="Ref" dir="ltr">{a.reference}</td>
            <td data-label="Balance" className="num" dir="ltr">{a.balance == null ? '—' : money(a.balance, a.currency)}</td><td data-label="Status"><StatusBadge status={a.status} /></td>
            <td className="actions">
              {can('transactions:write') && a.status === 'active' && <button className="btn sm ghost" onClick={() => setTxModal(a)}>Post transaction</button>}
              {can('accounts:manage') && <button className="btn sm ghost" onClick={() => act(() => api(`/admin/accounts/${a.id}`, { method: 'PATCH', body: { status: a.status === 'frozen' ? 'active' : 'frozen' } }), 'Account updated.')}>{a.status === 'frozen' ? 'Unfreeze' : 'Freeze'}</button>}
            </td></tr>
        ))}
      </tbody></table></div>

      {d.data.canViewTransactions ? (
        <><h2 className="h-sm">Recent transactions</h2>
          {transactions.length ? <div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="num">Amount</th></tr></thead><tbody>
            {transactions.map((x) => <tr key={x.id}><td data-label="Date">{dateTimeFmt(x.createdAt)}</td><td data-label="Reference" dir="ltr">{x.reference}</td><td data-label="Description">{x.description}<small className="sub" dir="ltr">{accMap[x.accountId]?.accountNumber}</small></td><td data-label="Amount" className={`num ${x.type === 'credit' ? 'pos' : 'neg'}`} dir="ltr">{x.type === 'credit' ? '+' : '−'}{money(x.amount, x.currency)}</td></tr>)}
          </tbody></table></div> : <p className="empty">No transactions yet.</p>}</>
      ) : <p className="hint">Transaction records are hidden: your role does not include transaction access.</p>}

      {notifications && (
        <>
          <div className="h-row"><h2 className="h-sm">Notification delivery</h2>{can('notifications:send') && c.status !== 'suspended' && <button className="btn ghost sm" onClick={() => setNotifModal(true)}>{c.status === 'pending' ? 'Resend activation' : 'Send password reset'}</button>}</div>
          {notifications.length ? <NotifTable items={notifications} /> : <p className="empty">No notifications sent.</p>}
        </>
      )}
      {edit && <EditClient c={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); setMsg({ kind: 'success', text: 'Client updated.' }); d.reload(); }} />}
      {txModal && <PostTx account={txModal} onClose={() => setTxModal(null)} onSaved={() => { setTxModal(null); setMsg({ kind: 'success', text: 'Transaction posted.' }); d.reload(); }} />}
      {acctModal && <AddAccount clientId={id} onClose={() => setAcctModal(false)} onSaved={() => { setAcctModal(false); setMsg({ kind: 'success', text: 'Account created.' }); d.reload(); }} />}
      {notifModal && <ResendModal client={c} onClose={() => { setNotifModal(false); d.reload(); }} />}
    </>
  );
}

function EditClient({ c, onClose, onSaved }) {
  const [f, setF] = useState({ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, country: c.country, preferredLanguage: c.preferredLanguage });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api(`/admin/clients/${c.id}`, { method: 'PATCH', body: f }); onSaved(); } catch (e2) { setErr(errMsg(e2, 'Could not save.')); } };
  return (
    <Modal title="Edit client" onClose={onClose} wide>
      <form onSubmit={submit}><Alert>{err}</Alert>
        <div className="form-grid">
          <Field id="e1" label="First name"><input id="e1" required value={f.firstName} onChange={set('firstName')} maxLength={80} /></Field>
          <Field id="e2" label="Last name"><input id="e2" required value={f.lastName} onChange={set('lastName')} maxLength={80} /></Field>
          <Field id="e3" label="Email"><input id="e3" type="email" required value={f.email} onChange={set('email')} /></Field>
          <Field id="e4" label="Mobile"><input id="e4" required value={f.phone} onChange={set('phone')} dir="ltr" pattern="\+[1-9][0-9]{7,14}" /></Field>
          <Field id="e5" label="Country"><select id="e5" value={f.country} onChange={set('country')}>{COUNTRIES.map(([x, n]) => <option key={x} value={x}>{n}</option>)}</select></Field>
          <Field id="e6" label="Preferred language"><select id="e6" value={f.preferredLanguage} onChange={set('preferredLanguage')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></Field>
        </div>
        <div className="row mt"><button className="btn primary">Save changes</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function PostTx({ account, onClose, onSaved }) {
  const [f, setF] = useState({ type: 'credit', amount: '', description: '', category: 'general' });
  const [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api(`/admin/accounts/${account.id}/transactions`, { method: 'POST', body: { ...f, amount: Number(f.amount) } }); onSaved(); } catch (e2) { setErr(errMsg(e2, 'Could not post.')); } };
  return (
    <Modal title={`Post transaction · ${account.accountNumber}`} onClose={onClose}>
      <form onSubmit={submit}><Alert>{err}</Alert>
        <Field id="t1" label="Type"><select id="t1" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="credit">Credit (money in)</option><option value="debit">Debit (money out)</option></select></Field>
        <Field id="t2" label={`Amount (${account.currency})`}><input id="t2" type="number" step="0.01" min="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} dir="ltr" autoFocus /></Field>
        <Field id="t3" label="Description"><input id="t3" required maxLength={140} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="row"><button className="btn primary">Post</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function AddAccount({ clientId, onClose, onSaved }) {
  const [f, setF] = useState({ type: 'savings', currency: 'GHS' });
  const [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); try { await api(`/admin/clients/${clientId}/accounts`, { method: 'POST', body: f }); onSaved(); } catch (e2) { setErr(errMsg(e2, 'Could not create.')); } };
  return (
    <Modal title="Add account" onClose={onClose}>
      <form onSubmit={submit}><Alert>{err}</Alert>
        <Field id="a1" label="Type"><select id="a1" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="current">Current</option><option value="savings">Savings</option><option value="fixed_deposit">Fixed deposit</option></select></Field>
        <Field id="a2" label="Currency"><select id="a2" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <div className="row"><button className="btn primary">Create account</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function ResendModal({ client, onClose }) {
  const [ch, setCh] = useState({ email: true, whatsapp: true, sms: true });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setErr(''); setBusy(true);
    try { setRes(await api(`/admin/clients/${client.id}/notifications`, { method: 'POST', body: { channels: Object.keys(ch).filter((k) => ch[k]), template: client.status === 'pending' ? 'account_created' : 'password_reset' } })); }
    catch (e) { setErr(errMsg(e, 'Could not send.')); } finally { setBusy(false); }
  };
  return (
    <Modal title={client.status === 'pending' ? 'Resend activation link' : 'Send password reset link'} onClose={onClose}>
      <Alert>{err}</Alert>
      {!res ? (
        <>
          <p className="muted">A fresh one-time link is generated and any previous link stops working.</p>
          <fieldset className="chk"><legend>Channels</legend>{['email', 'whatsapp', 'sms'].map((k) => <label key={k}><input type="checkbox" checked={ch[k]} onChange={(e) => setCh({ ...ch, [k]: e.target.checked })} /> {k === 'sms' ? 'SMS' : k === 'whatsapp' ? 'WhatsApp' : 'Email'}</label>)}</fieldset>
          <div className="row"><button className="btn primary" disabled={busy || !Object.values(ch).some(Boolean)} onClick={send}>Send</button><button className="btn ghost" onClick={onClose}>Cancel</button></div>
        </>
      ) : (
        <>
          <NotifTable items={res.notifications} />
          {res.devLink && <div className="dev-box"><b>Development only</b><code dir="ltr">{res.devLink}</code></div>}
          <button className="btn primary mt" onClick={onClose}>Done</button>
        </>
      )}
    </Modal>
  );
}

export function Staff() {
  const s = useLoad(() => api('/admin/staff'), []);
  const [show, setShow] = useState(false);
  const [edit, setEdit] = useState(null);
  const [res, setRes] = useState(null);
  return (
    <>
      <Head title="Staff & roles"><button className="btn primary sm" onClick={() => setShow(true)}><Icon name="plus" size={16} /> Invite staff</button></Head>
      {s.loading ? <Spinner label="Loading…" /> : s.error ? <Alert>{s.error}</Alert> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>MFA</th><th>Permissions</th><th /></tr></thead><tbody>
          {s.data.items.map((u) => (
            <tr key={u.id}><td data-label="Name"><b>{u.name}</b><small className="sub">{u.email}</small></td><td data-label="Role">{u.role === 'super_admin' ? 'Super admin' : 'Staff'}</td><td data-label="Status"><StatusBadge status={u.status} /></td><td data-label="MFA">{u.mfaEnabled ? 'Yes' : 'No'}</td>
              <td data-label="Permissions" className="perm-cell">{u.role === 'super_admin' ? 'All' : u.permissions.length ? u.permissions.map((p) => <span key={p} className="tag">{p}</span>) : '—'}</td>
              <td className="actions">{u.role === 'admin' && <button className="btn sm ghost" onClick={() => setEdit(u)}>Manage</button>}</td></tr>
          ))}
        </tbody></table></div>
      )}
      {show && <StaffModal perms={s.data?.availablePermissions || []} onClose={() => setShow(false)} onSaved={(r) => { setShow(false); setRes(r); s.reload(); }} />}
      {edit && <StaffModal staff={edit} perms={s.data.availablePermissions} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); s.reload(); }} />}
      {res && <Modal title="Staff invited" onClose={() => setRes(null)}><Alert kind="success">{res.staff.name} has been invited by email.</Alert><NotifTable items={res.notifications} />{res.devActivationUrl && <div className="dev-box"><b>Development only</b><code dir="ltr">{res.devActivationUrl}</code></div>}</Modal>}
    </>
  );
}

function StaffModal({ staff, perms, onClose, onSaved }) {
  const [f, setF] = useState({ name: staff?.name || '', email: staff?.email || '', permissions: staff?.permissions || ['clients:read'], status: staff?.status || 'active' });
  const [err, setErr] = useState('');
  const toggle = (p) => setF({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const r = staff ? await api(`/admin/staff/${staff.id}`, { method: 'PATCH', body: { name: f.name, permissions: f.permissions, status: f.status } }) : await api('/admin/staff', { method: 'POST', body: { name: f.name, email: f.email, permissions: f.permissions } });
      onSaved(r);
    } catch (e2) { setErr(errMsg(e2, 'Could not save.')); }
  };
  return (
    <Modal title={staff ? `Manage ${staff.name}` : 'Invite staff member'} onClose={onClose} wide>
      <form onSubmit={submit}><Alert>{err}</Alert>
        <div className="form-grid">
          <Field id="s1" label="Full name"><input id="s1" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></Field>
          <Field id="s2" label="Email"><input id="s2" type="email" required disabled={!!staff} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          {staff && <Field id="s3" label="Status"><select id="s3" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} disabled={staff.status === 'pending'}><option value="active">Active</option><option value="suspended">Suspended</option>{staff.status === 'pending' && <option value="pending">Pending</option>}</select></Field>}
        </div>
        <fieldset className="chk"><legend>Permissions</legend>{perms.map((p) => <label key={p}><input type="checkbox" checked={f.permissions.includes(p)} onChange={() => toggle(p)} /> {p}</label>)}</fieldset>
        <div className="row mt"><button className="btn primary">{staff ? 'Save' : 'Send invitation'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function Audit() {
  const [f, setF] = useState({ action: '', actor: '' });
  const [page, setPage] = useState(1);
  const l = useLoad(() => api('/admin/audit-logs', { params: { ...f, page, limit: 25 } }), [f.action, f.actor, page]);
  return (
    <>
      <Head title="Audit logs" />
      <div className="filters card">
        <Field id="aa" label="Action starts with"><input id="aa" placeholder="e.g. auth. or client." value={f.action} onChange={(e) => { setF({ ...f, action: e.target.value }); setPage(1); }} /></Field>
        <Field id="ab" label="Actor email contains"><input id="ab" value={f.actor} onChange={(e) => { setF({ ...f, actor: e.target.value }); setPage(1); }} /></Field>
      </div>
      {l.loading ? <Spinner label="Loading…" /> : l.error ? <Alert>{l.error}</Alert> : (
        <>
          <div className="table-wrap"><table className="table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>IP</th><th>Details</th></tr></thead><tbody>
            {l.data.items.map((a) => <tr key={a.id}><td data-label="Time">{dateTimeFmt(a.createdAt)}</td><td data-label="Actor">{a.actorEmail || '—'}<small className="sub">{a.actorRole}</small></td><td data-label="Action"><code>{a.action}</code></td><td data-label="Resource">{a.resourceType}<small className="sub" dir="ltr">{a.resourceId}</small></td><td data-label="IP" dir="ltr">{a.ip}</td><td data-label="Details" className="meta">{a.metadata ? JSON.stringify(a.metadata) : ''}</td></tr>)}
            {!l.data.items.length && <tr><td colSpan={6} className="empty">No entries.</td></tr>}
          </tbody></table></div>
          <Pagination page={l.data.page} pages={l.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}

export function AdminSecurity() {
  return (<><Head title="My security" /><div className="two-col"><ChangePassword /><MfaPanel /></div></>);
}
