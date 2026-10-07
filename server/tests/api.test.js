// Integration tests for the SRS acceptance criteria. Requires a MongoDB-compatible server at MONGODB_URI.
// Run:  MONGODB_URI=mongodb://127.0.0.1:27017/harbourline_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/harbourline_test';
const { default: app } = await import('../app.js');
const { connectDB } = await import('../db.js');
const models = await import('../models/index.js');
const { User, AuditLog, Notification, Account } = models;
const mongoose = (await import('mongoose')).default;

let server, base;
const run = Date.now().toString(36);
const SA = { email: `sa-${run}@t.example`, password: 'SuperAdmin#2026x' };
const GOOD_PW = 'Str0ng!Passw0rd';

class Session {
  constructor() { this.cookie = ''; }
  async req(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0].includes('=;') || /hb_session=;/.test(set) ? '' : set.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  }
}

before(async () => {
  await connectDB();
  await User.create({ email: SA.email, name: 'Test SA', role: 'super_admin', status: 'active', passwordHash: await bcrypt.hash(SA.password, 4) });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await mongoose.disconnect(); });

const ctx = {};

test('unauthenticated requests are rejected', async () => {
  const s = new Session();
  for (const p of ['/api/client/profile', '/api/admin/clients', '/api/admin/audit-logs', '/api/auth/me']) {
    const r = await s.req('GET', p);
    assert.equal(r.status, 401, p);
  }
});

test('admin can log in; wrong password and NoSQL injection fail', async () => {
  const bad = await new Session().req('POST', '/api/auth/login', { email: SA.email, password: 'nope', portal: 'admin' });
  assert.equal(bad.status, 401);
  const inj = await new Session().req('POST', '/api/auth/login', { email: { $ne: '' }, password: { $ne: '' }, portal: 'admin' });
  assert.ok([401, 422].includes(inj.status));
  ctx.admin = new Session();
  const r = await ctx.admin.req('POST', '/api/auth/login', { ...SA, portal: 'admin' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.user.role, 'super_admin');
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(r.headers.get('set-cookie'), /SameSite=Strict/i);
});

test('admin can create a client; notifications attempted on all three channels; no password in any record', async () => {
  const r = await ctx.admin.req('POST', '/api/admin/clients', {
    firstName: 'Test', lastName: `Client${run}`, email: `c1-${run}@t.example`, phone: '+233201234567', country: 'gh', preferredLanguage: 'fr',
    initialAccount: { type: 'current', currency: 'GHS', openingBalance: 100 },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  ctx.c1 = r.body.data.client;
  assert.equal(ctx.c1.status, 'pending');
  assert.equal(ctx.c1.country, 'GH');
  assert.deepEqual(r.body.data.notifications.map((n) => n.channel).sort(), ['email', 'sms', 'whatsapp']);
  ctx.activation = new URL(r.body.data.devActivationUrl).searchParams.get('token');
  assert.ok(ctx.activation.length >= 40);
  const notes = await Notification.find({ clientId: ctx.c1.id });
  assert.equal(notes.length, 3);
  assert.ok(notes.every((n) => !JSON.stringify(n).includes(ctx.activation)), 'activation token must not be stored in notification records');
  const u = await User.findOne({ email: ctx.c1.email }).select('+passwordHash +activationTokenHash');
  assert.equal(u.passwordHash, undefined, 'no password exists before activation');
  assert.notEqual(u.activationTokenHash, ctx.activation, 'token stored hashed');
});

test('duplicate email and invalid input are rejected', async () => {
  const dup = await ctx.admin.req('POST', '/api/admin/clients', { firstName: 'A', lastName: 'B', email: ctx.c1.email, phone: '+233201234567', country: 'GH' });
  assert.equal(dup.status, 409);
  const bad = await ctx.admin.req('POST', '/api/admin/clients', { firstName: 'A', lastName: 'B', email: 'x', phone: '0201234567', country: 'GHA' });
  assert.equal(bad.status, 422);
  assert.ok(bad.body.error.details.length >= 3);
});

test('client cannot log in before activation; activation rejects weak passwords and bad tokens', async () => {
  const pre = await new Session().req('POST', '/api/auth/login', { email: ctx.c1.email, password: GOOD_PW });
  assert.equal(pre.status, 401);
  const chk = await new Session().req('GET', `/api/auth/activate?token=${ctx.activation}`);
  assert.equal(chk.status, 200);
  const weak = await new Session().req('POST', '/api/auth/activate', { token: ctx.activation, password: 'short' });
  assert.equal(weak.status, 422);
  const badTok = await new Session().req('POST', '/api/auth/activate', { token: 'a'.repeat(64), password: GOOD_PW });
  assert.equal(badTok.status, 400);
});

test('client activates, token is single use, then logs in and sees only own data', async () => {
  const act = await new Session().req('POST', '/api/auth/activate', { token: ctx.activation, password: GOOD_PW });
  assert.equal(act.status, 200);
  const again = await new Session().req('POST', '/api/auth/activate', { token: ctx.activation, password: GOOD_PW });
  assert.equal(again.status, 400);

  // staff portal rejects client credentials
  const wrongPortal = await new Session().req('POST', '/api/auth/login', { email: ctx.c1.email, password: GOOD_PW, portal: 'admin' });
  assert.equal(wrongPortal.status, 401);

  ctx.client1 = new Session();
  const login = await ctx.client1.req('POST', '/api/auth/login', { email: ctx.c1.email, password: GOOD_PW });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.preferredLanguage, 'fr');
  const accts = await ctx.client1.req('GET', '/api/client/accounts');
  assert.equal(accts.body.data.items.length, 1);
  assert.equal(accts.body.data.items[0].balance, 10000);
  const alias = await ctx.client1.req('GET', '/api/accounts');
  assert.equal(alias.status, 200);
  const tx = await ctx.client1.req('GET', '/api/client/transactions');
  assert.equal(tx.body.data.total, 1);
  const notif = await ctx.client1.req('GET', '/api/client/notifications');
  assert.ok(notif.body.data.items.length >= 1);
  // client cannot reach admin API
  assert.equal((await ctx.client1.req('GET', '/api/admin/clients')).status, 403);
});

test('a client cannot access another client’s data', async () => {
  const mk = await ctx.admin.req('POST', '/api/admin/clients', { firstName: 'Other', lastName: 'Person', email: `c2-${run}@t.example`, phone: '+233201234568', country: 'GH', initialAccount: { type: 'savings', currency: 'GHS', openingBalance: 50 } });
  assert.equal(mk.status, 201);
  const token2 = new URL(mk.body.data.devActivationUrl).searchParams.get('token');
  await new Session().req('POST', '/api/auth/activate', { token: token2, password: GOOD_PW });
  const other = await Account.findOne({ clientId: mk.body.data.client.id });
  const r1 = await ctx.client1.req('GET', `/api/client/transactions?accountId=${other._id}`);
  assert.equal(r1.status, 404);
  const r2 = await ctx.client1.req('GET', `/api/client/statements?accountId=${other._id}&month=2026-10`);
  assert.equal(r2.status, 404);
});

test('statements reconcile with the balance', async () => {
  const a = (await ctx.client1.req('GET', '/api/client/accounts')).body.data.items[0];
  const month = new Date().toISOString().slice(0, 7);
  const st = await ctx.client1.req('GET', `/api/client/statements?accountId=${a.id}&month=${month}`);
  assert.equal(st.status, 200);
  const s = st.body.data.statement;
  assert.equal(s.openingBalance + s.totalCredits - s.totalDebits, s.closingBalance);
  assert.equal(s.closingBalance, a.balance);
});

test('ledger: credits/debits update balance; overdraft refused; permission enforced', async () => {
  const a = (await ctx.client1.req('GET', '/api/client/accounts')).body.data.items[0];
  const d = await ctx.admin.req('POST', `/api/admin/accounts/${a.id}/transactions`, { type: 'debit', amount: 30.5, description: 'Test debit' });
  assert.equal(d.status, 201);
  assert.equal(d.body.data.transaction.balanceAfter, 6950);
  const over = await ctx.admin.req('POST', `/api/admin/accounts/${a.id}/transactions`, { type: 'debit', amount: 1000, description: 'Too much' });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'INSUFFICIENT_FUNDS');
  const after = (await ctx.client1.req('GET', '/api/client/accounts')).body.data.items[0];
  assert.equal(after.balance, 6950);
});

test('staff permissions are enforced on the backend', async () => {
  const mk = await ctx.admin.req('POST', '/api/admin/staff', { name: 'Limited Staff', email: `st-${run}@t.example`, permissions: ['clients:read'] });
  assert.equal(mk.status, 201);
  const token = new URL(mk.body.data.devActivationUrl).searchParams.get('token');
  assert.equal((await new Session().req('POST', '/api/auth/activate', { token, password: GOOD_PW })).status, 200);
  const staff = new Session();
  assert.equal((await staff.req('POST', '/api/auth/login', { email: `st-${run}@t.example`, password: GOOD_PW, portal: 'admin' })).status, 200);
  assert.equal((await staff.req('GET', '/api/admin/clients')).status, 200);
  assert.equal((await staff.req('POST', '/api/admin/clients', { firstName: 'X', lastName: 'Y', email: `z-${run}@t.example`, phone: '+233201234569', country: 'GH' })).status, 403);
  assert.equal((await staff.req('GET', '/api/admin/audit-logs')).status, 403);
  assert.equal((await staff.req('GET', '/api/admin/staff')).status, 403);
  assert.equal((await staff.req('PATCH', `/api/admin/clients/${ctx.c1.id}`, { status: 'suspended' })).status, 403);
  const detail = await staff.req('GET', `/api/admin/clients/${ctx.c1.id}`);
  assert.equal(detail.body.data.canViewTransactions, false);
  assert.equal(detail.body.data.transactions, undefined);
  assert.equal(detail.body.data.accounts[0].balance, null);
  // client can't use staff portal creds on client portal
  assert.equal((await new Session().req('POST', '/api/auth/login', { email: `st-${run}@t.example`, password: GOOD_PW, portal: 'client' })).status, 401);
});

test('search, filter and pagination of clients', async () => {
  const r = await ctx.admin.req('GET', `/api/admin/clients?search=Client${run}&status=active&limit=5`);
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 1);
  assert.equal((await ctx.admin.req('GET', '/api/admin/clients?search=.*')).body.data.total, 0, 'regex chars are escaped');
});

test('suspend ends live sessions and blocks login; reactivation restores access', async () => {
  const s = await ctx.admin.req('PATCH', `/api/admin/clients/${ctx.c1.id}`, { status: 'suspended' });
  assert.equal(s.status, 200);
  assert.equal((await ctx.client1.req('GET', '/api/client/profile')).status, 401);
  const l = await new Session().req('POST', '/api/auth/login', { email: ctx.c1.email, password: GOOD_PW });
  assert.equal(l.status, 403);
  assert.equal(l.body.error.code, 'ACCOUNT_SUSPENDED');
  assert.equal((await ctx.admin.req('PATCH', `/api/admin/clients/${ctx.c1.id}`, { status: 'active' })).status, 200);
  assert.equal((await ctx.client1.req('POST', '/api/auth/login', { email: ctx.c1.email, password: GOOD_PW })).status, 200);
});

test('resend notification: blocked once active unless password_reset', async () => {
  const bad = await ctx.admin.req('POST', `/api/admin/clients/${ctx.c1.id}/notifications`, { template: 'account_created' });
  assert.equal(bad.status, 409);
  const good = await ctx.admin.req('POST', `/api/admin/clients/${ctx.c1.id}/notifications`, { template: 'password_reset', channels: ['email'] });
  assert.equal(good.status, 201);
  assert.equal(good.body.data.notifications.length, 1);
});

test('language preference persists and is validated', async () => {
  assert.equal((await ctx.client1.req('PATCH', '/api/client/profile', { preferredLanguage: 'es' })).status, 200);
  assert.equal((await ctx.client1.req('GET', '/api/client/profile')).body.data.profile.preferredLanguage, 'es');
  assert.equal((await ctx.client1.req('PATCH', '/api/client/profile', { preferredLanguage: 'xx' })).status, 422);
});

test('password change signs out other sessions; recovery flow is non-enumerating', async () => {
  const other = new Session();
  await other.req('POST', '/api/auth/login', { email: ctx.c1.email, password: GOOD_PW });
  const NEW_PW = 'An0ther!Passw0rd';
  assert.equal((await ctx.client1.req('POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: NEW_PW })).status, 400);
  assert.equal((await ctx.client1.req('POST', '/api/auth/change-password', { currentPassword: GOOD_PW, newPassword: NEW_PW })).status, 200);
  assert.equal((await other.req('GET', '/api/client/profile')).status, 401);
  assert.equal((await ctx.client1.req('GET', '/api/client/profile')).status, 200);
  const known = await new Session().req('POST', '/api/auth/forgot-password', { email: ctx.c1.email });
  const unknown = await new Session().req('POST', '/api/auth/forgot-password', { email: 'nobody@t.example' });
  assert.equal(known.status, 200);
  assert.deepEqual(known.body, unknown.body);
  ctx.pw = NEW_PW;
});

test('TOTP MFA: enrol, require at login, reject replay', async () => {
  const s = ctx.client1;
  const setup = await s.req('POST', '/api/auth/mfa/setup');
  assert.equal(setup.status, 200);
  const secret = setup.body.data.secret;
  assert.equal((await s.req('POST', '/api/auth/mfa/enable', { code: '000000' })).status, 400);
  const code = authenticator.generate(secret);
  assert.equal((await s.req('POST', '/api/auth/mfa/enable', { code })).status, 200);
  const fresh = new Session();
  const step1 = await fresh.req('POST', '/api/auth/login', { email: ctx.c1.email, password: ctx.pw });
  assert.equal(step1.body.data.mfaRequired, true);
  assert.equal((await fresh.req('GET', '/api/client/profile')).status, 401);
  const replay = await fresh.req('POST', '/api/auth/login', { email: ctx.c1.email, password: ctx.pw, code });
  assert.equal(replay.status, 401, 'code used during enrolment cannot be replayed');
});

test('account lockout after repeated failures', async () => {
  const victim = `lock-${run}@t.example`;
  await User.create({ email: victim, name: 'Lock', role: 'client', status: 'active', passwordHash: await bcrypt.hash(GOOD_PW, 4) });
  const s = new Session();
  for (let i = 0; i < 5; i++) assert.equal((await s.req('POST', '/api/auth/login', { email: victim, password: 'bad' })).status, 401);
  const locked = await s.req('POST', '/api/auth/login', { email: victim, password: GOOD_PW });
  assert.equal(locked.status, 429);
});

test('cross-origin writes are refused; security headers present', async () => {
  const r = await ctx.admin.req('POST', '/api/admin/clients', {}, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  const h = await new Session().req('GET', '/api/health');
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(h.headers.get('content-security-policy'));
  assert.equal(h.headers.get('x-powered-by'), null);
});

test('audit log captured sensitive actions without secrets', async () => {
  const logs = await ctx.admin.req('GET', '/api/admin/audit-logs?limit=100');
  assert.equal(logs.status, 200);
  const actions = new Set(logs.body.data.items.map((a) => a.action));
  for (const a of ['auth.login_success', 'auth.login_failed', 'client.created', 'auth.account_activated', 'client.suspended', 'client.reactivated', 'transaction.posted', 'staff.created', 'auth.password_changed', 'auth.mfa_enabled'])
    assert.ok(actions.has(a), `missing audit action ${a}`);
  const dump = JSON.stringify(await AuditLog.find({}).lean());
  assert.ok(!dump.includes(GOOD_PW) && !dump.includes(ctx.activation), 'no secrets in audit logs');
});

test('logout clears the session', async () => {
  const s = new Session();
  await s.req('POST', '/api/auth/login', { ...SA, portal: 'admin' });
  assert.equal((await s.req('GET', '/api/auth/me')).status, 200);
  assert.equal((await s.req('POST', '/api/auth/logout')).status, 200);
  assert.equal((await s.req('GET', '/api/auth/me')).status, 401);
});
