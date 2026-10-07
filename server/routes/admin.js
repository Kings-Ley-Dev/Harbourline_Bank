import { Router } from 'express';
import mongoose from 'mongoose';
import { body, param, query } from 'express-validator';
import { config, LANGUAGES, CURRENCIES, PERMISSIONS } from '../config.js';
import { User, Client, Account, Transaction, Notification, AuditLog } from '../models/index.js';
import { HttpError, ah, ok, sha256, randomToken, randomDigits, escapeRegex, pageParams } from '../utils.js';
import { authenticate, requireRole, requirePermission, validate } from '../middleware.js';
import { audit } from '../services/audit.js';
import { sendTemplated } from '../services/notify.js';
import { postTransaction, newAccountNumber } from '../services/ledger.js';

const router = Router();
router.use(authenticate, requireRole('super_admin', 'admin'));

const idParam = (name = 'id') => param(name).custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid id.');
const has = (user, perm) => user.role === 'super_admin' || user.permissions.includes(perm);
const E164 = /^\+[1-9]\d{7,14}$/;

async function newCustomerId() {
  for (let i = 0; i < 10; i++) {
    const id = `HB${randomDigits(8)}`;
    if (!(await Client.exists({ customerId: id }))) return id;
  }
  throw new HttpError(500, 'INTERNAL', 'Could not allocate a customer ID.');
}

async function issueActivation(user) {
  const token = randomToken();
  user.activationTokenHash = sha256(token);
  user.activationExpires = new Date(Date.now() + config.activationHours * 3600 * 1000);
  await user.save();
  return `${config.appUrl}/activate?token=${token}`;
}

async function issueReset(user) {
  const token = randomToken();
  user.resetTokenHash = sha256(token);
  user.resetExpires = new Date(Date.now() + config.resetMinutes * 60000);
  await user.save();
  return `${config.appUrl}/reset-password?token=${token}`;
}

const clientView = (c, u) => ({
  id: c._id,
  customerId: c.customerId,
  firstName: c.firstName,
  lastName: c.lastName,
  email: c.email,
  phone: c.phone,
  country: c.country,
  preferredLanguage: c.preferredLanguage,
  status: c.status,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  ...(u ? { lastLoginAt: u.lastLoginAt, mfaEnabled: !!u.mfa?.enabled, activated: u.status === 'active' || !!u.passwordChangedAt } : {}),
});

const notifView = (n) => ({
  id: n._id, channel: n.channel, recipient: n.recipient, template: n.template, status: n.status,
  providerResponse: n.providerResponse, sentAt: n.sentAt, createdAt: n.createdAt,
});

// ---- Dashboard stats -------------------------------------------------------
router.get(
  '/stats',
  requirePermission('clients:read'),
  ah(async (req, res) => {
    const since = new Date(Date.now() - 7 * 86400000);
    const [total, active, pending, suspended, failed, sent, recentClients] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: 'active' }),
      Client.countDocuments({ status: 'pending' }),
      Client.countDocuments({ status: 'suspended' }),
      Notification.countDocuments({ status: 'failed', channel: { $ne: 'in_app' }, createdAt: { $gte: since } }),
      Notification.countDocuments({ status: 'sent', channel: { $ne: 'in_app' }, createdAt: { $gte: since } }),
      Client.find().sort({ createdAt: -1 }).limit(5),
    ]);
    ok(res, { clients: { total, active, pending, suspended }, notifications7d: { sent, failed }, recentClients: recentClients.map((c) => clientView(c)) });
  })
);

// ---- Clients ---------------------------------------------------------------
router.post(
  '/clients',
  requirePermission('clients:create'),
  [
    body('firstName').isString().trim().isLength({ min: 1, max: 80 }),
    body('lastName').isString().trim().isLength({ min: 1, max: 80 }),
    body('email').isString().trim().toLowerCase().isEmail().withMessage('Enter a valid email.'),
    body('phone').isString().trim().matches(E164).withMessage('Phone must be in international format, e.g. +233241234567.'),
    body('country').isString().trim().toUpperCase().isLength({ min: 2, max: 2 }).withMessage('Use a 2-letter country code.'),
    body('preferredLanguage').optional().isIn(LANGUAGES),
    body('status').optional().isIn(['pending', 'suspended']),
    body('customerId').optional({ values: 'falsy' }).isString().trim().toUpperCase().matches(/^[A-Z0-9-]{4,20}$/),
    body('initialAccount').optional().isObject(),
    body('initialAccount.type').optional().isIn(['current', 'savings', 'fixed_deposit']),
    body('initialAccount.currency').optional().isIn(CURRENCIES),
    body('initialAccount.openingBalance').optional().isFloat({ min: 0, max: 1e9 }),
    body('channels').optional().isArray(),
    validate,
  ],
  ah(async (req, res) => {
    const b = req.body;
    if (await User.exists({ email: b.email })) throw new HttpError(409, 'DUPLICATE', 'A user with this email already exists.');
    const customerId = b.customerId || (await newCustomerId());
    if (await Client.exists({ customerId })) throw new HttpError(409, 'DUPLICATE', 'This customer ID is already in use.');

    const user = await User.create({
      email: b.email, name: `${b.firstName} ${b.lastName}`, role: 'client', status: 'pending',
      preferredLanguage: b.preferredLanguage || 'en',
    });
    let client;
    try {
      client = await Client.create({
        userId: user._id, customerId, firstName: b.firstName, lastName: b.lastName, email: b.email, phone: b.phone,
        country: b.country, preferredLanguage: b.preferredLanguage || 'en', status: b.status || 'pending', createdBy: req.user._id,
      });
    } catch (e) {
      await User.deleteOne({ _id: user._id });
      throw e;
    }
    if (client.status === 'suspended') await User.updateOne({ _id: user._id }, { status: 'suspended' });

    const ia = b.initialAccount || { type: 'current', currency: 'GHS', openingBalance: 0 };
    const account = await Account.create({
      clientId: client._id, accountNumber: await newAccountNumber(), reference: customerId,
      type: ia.type || 'current', currency: ia.currency || 'GHS', balance: 0,
    });
    const opening = Math.round(Number(ia.openingBalance || 0) * 100);
    if (opening > 0 && has(req.user, 'transactions:write')) {
      await postTransaction({ accountId: account._id, type: 'credit', amount: opening, description: 'Opening deposit', category: 'deposit', createdBy: req.user._id });
    }
    await audit(req, 'client.created', { resourceType: 'client', resourceId: client._id, metadata: { customerId, email: client.email, country: client.country, language: client.preferredLanguage } });

    // Notifications (activation link is delivered only through the notification channels).
    let notifications = [];
    let devActivationUrl;
    if (client.status === 'pending') {
      const link = await issueActivation(user);
      const chans = (b.channels || ['email', 'whatsapp', 'sms']).filter((c) => ['email', 'whatsapp', 'sms'].includes(c));
      notifications = await sendTemplated({ client, template: 'account_created', link, channelsToUse: chans, triggeredBy: req.user._id });
      await audit(req, 'notification.sent', { resourceType: 'client', resourceId: client._id, metadata: { template: 'account_created', results: notifications.map((n) => `${n.channel}:${n.status}`) } });
      if (config.exposeDevLinks) devActivationUrl = link;
    }
    ok(res, { client: clientView(client), notifications: notifications.map(notifView), ...(devActivationUrl ? { devActivationUrl } : {}) }, 201);
  })
);

router.get(
  '/clients',
  requirePermission('clients:read'),
  [
    query('status').optional().isIn(['pending', 'active', 'suspended']),
    query('search').optional().isString().isLength({ max: 100 }),
    query('country').optional().isString().isLength({ min: 2, max: 2 }),
    query('language').optional().isIn(LANGUAGES),
    validate,
  ],
  ah(async (req, res) => {
    const { page, limit, skip } = pageParams(req.query);
    const f = {};
    if (req.query.status) f.status = req.query.status;
    if (req.query.country) f.country = req.query.country.toUpperCase();
    if (req.query.language) f.preferredLanguage = req.query.language;
    if (req.query.search?.trim()) {
      const re = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      f.$or = [{ firstName: re }, { lastName: re }, { email: re }, { customerId: re }, { phone: re }];
    }
    const [items, total] = await Promise.all([Client.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), Client.countDocuments(f)]);
    ok(res, { items: items.map((c) => clientView(c)), page, limit, total, pages: Math.ceil(total / limit) });
  })
);

router.get(
  '/clients/:id',
  requirePermission('clients:read'),
  [idParam(), validate],
  ah(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client not found.');
    const user = await User.findById(client.userId);
    const out = { client: clientView(client, user) };
    const accounts = await Account.find({ clientId: client._id }).sort({ createdAt: 1 });
    out.accounts = accounts.map((a) => ({ id: a._id, accountNumber: a.accountNumber, reference: a.reference, type: a.type, currency: a.currency, balance: has(req.user, 'transactions:read') || has(req.user, 'accounts:manage') ? a.balance : null, status: a.status }));
    out.canViewTransactions = has(req.user, 'transactions:read');
    if (out.canViewTransactions) {
      const tx = await Transaction.find({ clientId: client._id }).sort({ createdAt: -1 }).limit(25);
      out.transactions = tx.map(txView);
    }
    if (has(req.user, 'notifications:send') || has(req.user, 'clients:read')) {
      const n = await Notification.find({ clientId: client._id, channel: { $ne: 'in_app' } }).sort({ createdAt: -1 }).limit(20);
      out.notifications = n.map(notifView);
    }
    await audit(req, 'client.viewed', { resourceType: 'client', resourceId: client._id });
    ok(res, out);
  })
);

const txView = (t) => ({ id: t._id, reference: t.reference, accountId: t.accountId, type: t.type, category: t.category, description: t.description, amount: t.amount, currency: t.currency, status: t.status, balanceAfter: t.balanceAfter, createdAt: t.createdAt });

router.patch(
  '/clients/:id',
  requirePermission('clients:update'),
  [
    idParam(),
    body('firstName').optional().isString().trim().isLength({ min: 1, max: 80 }),
    body('lastName').optional().isString().trim().isLength({ min: 1, max: 80 }),
    body('email').optional().isString().trim().toLowerCase().isEmail(),
    body('phone').optional().isString().trim().matches(E164),
    body('country').optional().isString().trim().toUpperCase().isLength({ min: 2, max: 2 }),
    body('preferredLanguage').optional().isIn(LANGUAGES),
    body('status').optional().isIn(['active', 'suspended']),
    validate,
  ],
  ah(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client not found.');
    const user = await User.findById(client.userId).select('+passwordHash');
    const before = clientView(client);
    const b = req.body;

    if (b.status !== undefined && b.status !== client.status) {
      if (!has(req.user, 'clients:suspend')) throw new HttpError(403, 'FORBIDDEN', 'You are not permitted to suspend or reactivate clients.');
      if (b.status === 'active' && !user.passwordHash) throw new HttpError(409, 'NOT_ACTIVATED', 'This client has not activated their account yet.');
      client.status = b.status;
      user.status = b.status;
      if (b.status === 'suspended') user.tokenVersion += 1; // terminate live sessions
    }
    if (b.email && b.email !== client.email) {
      if (await User.exists({ email: b.email, _id: { $ne: user._id } })) throw new HttpError(409, 'DUPLICATE', 'That email is already in use.');
      client.email = b.email;
      user.email = b.email;
    }
    for (const f of ['firstName', 'lastName', 'phone', 'country', 'preferredLanguage']) if (b[f] !== undefined) client[f] = b[f];
    user.name = `${client.firstName} ${client.lastName}`;
    user.preferredLanguage = client.preferredLanguage;
    await Promise.all([client.save(), user.save()]);

    const after = clientView(client);
    const changed = Object.keys(after).filter((k) => !['updatedAt'].includes(k) && String(after[k]) !== String(before[k]));
    const action = changed.includes('status') ? (client.status === 'suspended' ? 'client.suspended' : 'client.reactivated') : 'client.updated';
    await audit(req, action, { resourceType: 'client', resourceId: client._id, metadata: { changed: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: after[k] }])) } });
    ok(res, { client: after });
  })
);

router.post(
  '/clients/:id/notifications',
  requirePermission('notifications:send'),
  [
    idParam(),
    body('channels').optional().isArray({ min: 1 }),
    body('channels.*').optional().isIn(['email', 'whatsapp', 'sms']),
    body('template').optional().isIn(['account_created', 'password_reset']),
    validate,
  ],
  ah(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client not found.');
    const user = await User.findById(client.userId);
    const template = req.body.template || (client.status === 'pending' ? 'account_created' : 'password_reset');
    if (client.status === 'suspended') throw new HttpError(409, 'SUSPENDED', 'Reactivate this client before sending account notifications.');
    if (template === 'account_created' && user.status !== 'pending') throw new HttpError(409, 'ALREADY_ACTIVE', 'This client has already activated their account. Send a password reset instead.');
    const link = template === 'account_created' ? await issueActivation(user) : await issueReset(user);
    const notifications = await sendTemplated({ client, template, link, channelsToUse: req.body.channels || ['email', 'whatsapp', 'sms'], triggeredBy: req.user._id });
    await audit(req, 'notification.resent', { resourceType: 'client', resourceId: client._id, metadata: { template, results: notifications.map((n) => `${n.channel}:${n.status}`) } });
    ok(res, { notifications: notifications.map(notifView), ...(config.exposeDevLinks ? { devLink: link } : {}) }, 201);
  })
);

router.post(
  '/clients/:id/reset-mfa',
  requirePermission('clients:update'),
  [idParam(), validate],
  ah(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client not found.');
    await User.updateOne({ _id: client.userId }, { $set: { 'mfa.enabled': false }, $unset: { 'mfa.secret': 1, 'mfa.pendingSecret': 1 }, $inc: { tokenVersion: 1 } });
    await audit(req, 'client.mfa_reset', { resourceType: 'client', resourceId: client._id });
    ok(res, { reset: true });
  })
);

// ---- Accounts & transactions ----------------------------------------------
router.post(
  '/clients/:id/accounts',
  requirePermission('accounts:manage'),
  [idParam(), body('type').isIn(['current', 'savings', 'fixed_deposit']), body('currency').isIn(CURRENCIES), validate],
  ah(async (req, res) => {
    const client = await Client.findById(req.params.id);
    if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client not found.');
    const a = await Account.create({ clientId: client._id, accountNumber: await newAccountNumber(), reference: client.customerId, type: req.body.type, currency: req.body.currency });
    await audit(req, 'account.created', { resourceType: 'account', resourceId: a._id, metadata: { clientId: client._id, type: a.type, currency: a.currency } });
    ok(res, { account: { id: a._id, accountNumber: a.accountNumber, type: a.type, currency: a.currency, balance: a.balance, status: a.status } }, 201);
  })
);

router.patch(
  '/accounts/:accountId',
  requirePermission('accounts:manage'),
  [idParam('accountId'), body('status').isIn(['active', 'frozen', 'closed']), validate],
  ah(async (req, res) => {
    const a = await Account.findById(req.params.accountId);
    if (!a) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
    const from = a.status;
    a.status = req.body.status;
    await a.save();
    await audit(req, 'account.status_changed', { resourceType: 'account', resourceId: a._id, metadata: { from, to: a.status } });
    ok(res, { account: { id: a._id, status: a.status } });
  })
);

router.get(
  '/clients/:id/transactions',
  requirePermission('transactions:read'),
  [idParam(), validate],
  ah(async (req, res) => {
    const { page, limit, skip } = pageParams(req.query);
    const f = { clientId: req.params.id };
    const [items, total] = await Promise.all([Transaction.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), Transaction.countDocuments(f)]);
    ok(res, { items: items.map(txView), page, limit, total, pages: Math.ceil(total / limit) });
  })
);

router.post(
  '/accounts/:accountId/transactions',
  requirePermission('transactions:write'),
  [
    idParam('accountId'),
    body('type').isIn(['credit', 'debit']),
    body('amount').isFloat({ gt: 0, max: 1e9 }).withMessage('Enter an amount greater than zero.'),
    body('description').isString().trim().isLength({ min: 1, max: 140 }),
    body('category').optional().isString().trim().isLength({ max: 40 }),
    validate,
  ],
  ah(async (req, res) => {
    const tx = await postTransaction({
      accountId: req.params.accountId, type: req.body.type, amount: Math.round(Number(req.body.amount) * 100),
      description: req.body.description, category: req.body.category || 'general', createdBy: req.user._id,
    });
    await audit(req, 'transaction.posted', { resourceType: 'transaction', resourceId: tx._id, metadata: { reference: tx.reference, type: tx.type, amount: tx.amount, currency: tx.currency, clientId: tx.clientId } });
    ok(res, { transaction: txView(tx) }, 201);
  })
);

// ---- Audit logs ------------------------------------------------------------
router.get(
  '/audit-logs',
  requirePermission('audit:read'),
  ah(async (req, res) => {
    const { page, limit, skip } = pageParams(req.query, 25);
    const f = {};
    if (req.query.action) f.action = new RegExp(`^${escapeRegex(req.query.action)}`);
    if (req.query.actor) f.actorEmail = new RegExp(escapeRegex(req.query.actor), 'i');
    if (req.query.resourceType) f.resourceType = String(req.query.resourceType);
    const [items, total] = await Promise.all([AuditLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), AuditLog.countDocuments(f)]);
    ok(res, {
      items: items.map((a) => ({ id: a._id, action: a.action, actorEmail: a.actorEmail, actorRole: a.actorRole, resourceType: a.resourceType, resourceId: a.resourceId, ip: a.ip, metadata: a.metadata, createdAt: a.createdAt })),
      page, limit, total, pages: Math.ceil(total / limit),
    });
  })
);

// ---- Staff management (super admin only) ----------------------------------
const staffRouter = Router();
staffRouter.use(requireRole('super_admin'));
const staffView = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, permissions: u.permissions, mfaEnabled: !!u.mfa?.enabled, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });

staffRouter.get('/', ah(async (req, res) => {
  const items = await User.find({ role: { $in: ['admin', 'super_admin'] } }).sort({ createdAt: 1 });
  ok(res, { items: items.map(staffView), availablePermissions: PERMISSIONS });
}));

staffRouter.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }),
    body('email').isString().trim().toLowerCase().isEmail(),
    body('permissions').isArray(),
    body('permissions.*').isIn(PERMISSIONS),
    validate,
  ],
  ah(async (req, res) => {
    if (await User.exists({ email: req.body.email })) throw new HttpError(409, 'DUPLICATE', 'A user with this email already exists.');
    const u = await User.create({ name: req.body.name, email: req.body.email, role: 'admin', status: 'pending', permissions: [...new Set(req.body.permissions)] });
    const link = await issueActivation(u);
    const notes = await sendTemplated({
      client: { _id: undefined, userId: u._id, firstName: u.name, email: u.email, phone: '', preferredLanguage: 'en', customerId: 'STAFF' },
      template: 'account_created', link, channelsToUse: ['email'], triggeredBy: req.user._id,
    });
    await audit(req, 'staff.created', { resourceType: 'user', resourceId: u._id, metadata: { email: u.email, permissions: u.permissions } });
    ok(res, { staff: staffView(u), notifications: notes.map(notifView), ...(config.exposeDevLinks ? { devActivationUrl: link } : {}) }, 201);
  })
);

staffRouter.patch(
  '/:id',
  [idParam(), body('permissions').optional().isArray(), body('permissions.*').optional().isIn(PERMISSIONS), body('status').optional().isIn(['active', 'suspended']), body('name').optional().isString().trim().isLength({ min: 1, max: 100 }), validate],
  ah(async (req, res) => {
    const u = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!u) throw new HttpError(404, 'NOT_FOUND', 'Staff member not found.');
    const before = { permissions: u.permissions, status: u.status };
    if (req.body.permissions) u.permissions = [...new Set(req.body.permissions)];
    if (req.body.name) u.name = req.body.name;
    if (req.body.status && req.body.status !== u.status) {
      if (req.body.status === 'active' && !(await User.exists({ _id: u._id, passwordHash: { $exists: true } }))) throw new HttpError(409, 'NOT_ACTIVATED', 'This staff member has not activated their account yet.');
      u.status = req.body.status;
    }
    u.tokenVersion += 1; // permissions changed: force re-authentication
    await u.save();
    await audit(req, 'staff.updated', { resourceType: 'user', resourceId: u._id, metadata: { before, after: { permissions: u.permissions, status: u.status } } });
    ok(res, { staff: staffView(u) });
  })
);

staffRouter.post('/:id/resend-activation', [idParam(), validate], ah(async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, role: 'admin', status: 'pending' });
  if (!u) throw new HttpError(404, 'NOT_FOUND', 'No pending staff member with this id.');
  const link = await issueActivation(u);
  const notes = await sendTemplated({
    client: { _id: undefined, userId: u._id, firstName: u.name, email: u.email, phone: '', preferredLanguage: 'en', customerId: 'STAFF' },
    template: 'account_created', link, channelsToUse: ['email'], triggeredBy: req.user._id,
  });
  await audit(req, 'staff.activation_resent', { resourceType: 'user', resourceId: u._id });
  ok(res, { notifications: notes.map(notifView), ...(config.exposeDevLinks ? { devActivationUrl: link } : {}) });
}));

router.use('/staff', staffRouter);

export default router;
