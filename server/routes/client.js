import { Router } from 'express';
import mongoose from 'mongoose';
import { body, query, param } from 'express-validator';
import { config, LANGUAGES } from '../config.js';
import { Account, Transaction, Notification, User } from '../models/index.js';
import { HttpError, ah, ok, escapeRegex, pageParams } from '../utils.js';
import { authenticate, requireRole, loadClient, validate } from '../middleware.js';

const router = Router();
// Every client route: authenticated, role=client, and scoped to the caller's own client record.
router.use(authenticate, requireRole('client'), loadClient);

const acctView = (a) => ({ id: a._id, accountNumber: a.accountNumber, reference: a.reference, type: a.type, currency: a.currency, balance: a.balance, availableBalance: a.balance, status: a.status });
const txView = (t) => ({ id: t._id, reference: t.reference, accountId: t.accountId, type: t.type, category: t.category, description: t.description, amount: t.amount, currency: t.currency, status: t.status, balanceAfter: t.balanceAfter, createdAt: t.createdAt });

router.get('/profile', ah(async (req, res) => {
  const c = req.client;
  const u = await User.findById(req.user._id);
  ok(res, { profile: { customerId: c.customerId, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, country: c.country, preferredLanguage: c.preferredLanguage, status: c.status, memberSince: c.createdAt, mfaEnabled: !!u.mfa.enabled, lastLoginAt: u.lastLoginAt, statementsEnabled: config.statementsEnabled } });
}));

router.patch('/profile', [body('preferredLanguage').isIn(LANGUAGES), validate], ah(async (req, res) => {
  req.client.preferredLanguage = req.body.preferredLanguage;
  req.user.preferredLanguage = req.body.preferredLanguage;
  await Promise.all([req.client.save(), req.user.save()]);
  ok(res, { preferredLanguage: req.client.preferredLanguage });
}));

router.get('/accounts', ah(async (req, res) => {
  const accounts = await Account.find({ clientId: req.client._id }).sort({ createdAt: 1 });
  ok(res, { items: accounts.map(acctView) });
}));

const buildTxFilter = async (req) => {
  const f = { clientId: req.client._id };
  if (req.query.accountId) {
    if (!mongoose.isValidObjectId(req.query.accountId)) throw new HttpError(422, 'VALIDATION_ERROR', 'Invalid account.');
    const a = await Account.findOne({ _id: req.query.accountId, clientId: req.client._id });
    if (!a) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
    f.accountId = a._id;
  }
  if (req.query.type) f.type = req.query.type;
  if (req.query.q?.trim()) f.description = new RegExp(escapeRegex(req.query.q.trim()), 'i');
  const range = {};
  if (req.query.from) range.$gte = new Date(req.query.from);
  if (req.query.to) range.$lte = new Date(new Date(req.query.to).getTime() + 86400000 - 1);
  if (Object.keys(range).length) f.createdAt = range;
  return f;
};

router.get(
  '/transactions',
  [
    query('type').optional().isIn(['credit', 'debit']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('format').optional().isIn(['json', 'csv']),
    validate,
  ],
  ah(async (req, res) => {
    const f = await buildTxFilter(req);
    if (req.query.format === 'csv') {
      const rows = await Transaction.find(f).sort({ createdAt: -1 }).limit(5000);
      const esc = (v) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`; // CSV-injection safe
      const csv = ['Date,Reference,Description,Type,Amount,Currency,Balance after']
        .concat(rows.map((t) => [t.createdAt.toISOString(), t.reference, t.description, t.type, (t.amount / 100).toFixed(2), t.currency, t.balanceAfter != null ? (t.balanceAfter / 100).toFixed(2) : ''].map(esc).join(',')))
        .join('\n');
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"' });
      return res.send(csv);
    }
    const { page, limit, skip } = pageParams(req.query);
    const [items, total] = await Promise.all([Transaction.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), Transaction.countDocuments(f)]);
    ok(res, { items: items.map(txView), page, limit, total, pages: Math.ceil(total / limit) });
  })
);

router.get(
  '/statements',
  [query('accountId').custom((v) => mongoose.isValidObjectId(v)), query('month').matches(/^\d{4}-(0[1-9]|1[0-2])$/), validate],
  ah(async (req, res) => {
    if (!config.statementsEnabled) throw new HttpError(404, 'NOT_ENABLED', 'Statements are not enabled.');
    const acct = await Account.findOne({ _id: req.query.accountId, clientId: req.client._id });
    if (!acct) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
    const [y, m] = req.query.month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const net = (rows) => rows.reduce((s, t) => s + (t.type === 'credit' ? t.amount : -t.amount), 0);
    const after = await Transaction.find({ accountId: acct._id, createdAt: { $gte: end } });
    const inPeriod = await Transaction.find({ accountId: acct._id, createdAt: { $gte: start, $lt: end } }).sort({ createdAt: 1 });
    const closing = acct.balance - net(after);
    const opening = closing - net(inPeriod);
    ok(res, {
      statement: {
        account: acctView(acct), month: req.query.month, openingBalance: opening, closingBalance: closing,
        totalCredits: inPeriod.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
        totalDebits: inPeriod.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
        transactions: inPeriod.map(txView),
      },
    });
  })
);

router.get('/notifications', ah(async (req, res) => {
  const items = await Notification.find({ clientId: req.client._id, channel: 'in_app' }).sort({ createdAt: -1 }).limit(100);
  ok(res, { items: items.map((n) => ({ id: n._id, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt })), unread: items.filter((n) => !n.read).length });
}));

router.post('/notifications/read-all', ah(async (req, res) => {
  await Notification.updateMany({ clientId: req.client._id, channel: 'in_app', read: false }, { read: true });
  ok(res, { updated: true });
}));

router.patch('/notifications/:id/read', [param('id').custom((v) => mongoose.isValidObjectId(v)), validate], ah(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, clientId: req.client._id, channel: 'in_app' }, { read: true }, { new: true });
  if (!n) throw new HttpError(404, 'NOT_FOUND', 'Notification not found.');
  ok(res, { id: n._id, read: true });
}));

export default router;
