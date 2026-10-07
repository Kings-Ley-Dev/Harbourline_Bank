import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, query } from 'express-validator';
import { authenticator } from 'otplib';
import { config, LANGUAGES } from '../config.js';
import { User, Client } from '../models/index.js';
import { HttpError, ah, ok, sha256, randomToken, passwordProblems, encrypt, decrypt, maskEmail } from '../utils.js';
import { authenticate, validate, issueSession, cookieOpts } from '../middleware.js';
import { audit } from '../services/audit.js';
import { sendTemplated, inApp } from '../services/notify.js';

const router = Router();
authenticator.options = { window: 1 };
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', 12);

const userView = async (u) => {
  const v = {
    id: u._id,
    email: u.email,
    name: u.name,
    role: u.role,
    permissions: u.role === 'super_admin' ? ['*'] : u.permissions,
    preferredLanguage: u.preferredLanguage,
    mfaEnabled: !!u.mfa?.enabled,
    mfaSetupRequired: u.role !== 'client' && config.enforceAdminMfa && !u.mfa?.enabled,
    lastLoginAt: u.lastLoginAt,
  };
  if (u.role === 'client') {
    const c = await Client.findOne({ userId: u._id });
    if (c) v.client = { id: c._id, customerId: c.customerId, firstName: c.firstName, lastName: c.lastName, country: c.country };
    if (c) v.name = `${c.firstName} ${c.lastName}`;
  }
  return v;
};

const pwRule = (field) =>
  body(field).isString().custom((v) => {
    const p = passwordProblems(v);
    if (p.length) throw new Error(`Password needs ${p.join(', ')}.`);
    return true;
  });

const codeOk = (user, code, secret) => {
  if (!code || !secret) return false;
  const delta = authenticator.checkDelta(String(code).replace(/\s/g, ''), secret);
  if (delta === null) return false;
  const step = Math.floor(Date.now() / 30000) + delta;
  if (step <= (user.mfa.lastUsedStep || 0)) return false; // replay protection
  user.mfa.lastUsedStep = step;
  return true;
};

const recipientFromUser = (u) => ({
  _id: undefined, userId: u._id, firstName: u.name || u.email.split('@')[0], email: u.email, phone: '',
  preferredLanguage: u.preferredLanguage, customerId: '',
});

// ---- Login -----------------------------------------------------------------
router.post(
  '/login',
  [
    body('email').isString().trim().toLowerCase().isEmail().withMessage('Enter a valid email address.'),
    body('password').isString().isLength({ min: 1, max: 200 }),
    body('code').optional({ values: 'falsy' }).isString().isLength({ min: 6, max: 10 }),
    body('portal').optional().isIn(['client', 'admin']),
    validate,
  ],
  ah(async (req, res) => {
    const { email, password, code, portal = 'client' } = req.body;
    const invalid = () => new HttpError(401, 'INVALID_CREDENTIALS', 'The email or password you entered is incorrect.');

    const user = await User.findOne({ email }).select('+passwordHash +mfa.secret');
    if (!user || !user.passwordHash) {
      await bcrypt.compare(password, DUMMY_HASH); // equalise timing
      await audit(req, 'auth.login_failed', { actor: { email }, metadata: { reason: 'unknown_or_inactive', portal } });
      throw invalid();
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      await audit(req, 'auth.login_blocked', { actor: user, resourceType: 'user', resourceId: user._id, metadata: { reason: 'locked' } });
      throw new HttpError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Please try again in a few minutes.');
    }

    const isStaff = user.role !== 'client';
    const passOk = await bcrypt.compare(password, user.passwordHash);
    const portalOk = portal === 'admin' ? isStaff : !isStaff;

    const registerFailure = async (reason) => {
      user.failedLogins += 1;
      if (user.failedLogins >= config.maxFailedLogins) {
        user.lockUntil = new Date(Date.now() + config.lockMinutes * 60000);
        user.failedLogins = 0;
      }
      await user.save();
      await audit(req, 'auth.login_failed', { actor: user, resourceType: 'user', resourceId: user._id, metadata: { reason, portal } });
    };

    if (!passOk || !portalOk) {
      await registerFailure(!passOk ? 'bad_password' : 'wrong_portal');
      throw invalid();
    }
    if (user.status === 'suspended') {
      await audit(req, 'auth.login_blocked', { actor: user, resourceType: 'user', resourceId: user._id, metadata: { reason: 'suspended' } });
      throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact support.');
    }
    if (user.status !== 'active') throw invalid();

    if (user.mfa.enabled) {
      if (!code) return ok(res, { mfaRequired: true });
      const secret = decrypt(user.mfa.secret);
      if (!codeOk(user, code, secret)) {
        await registerFailure('bad_mfa_code');
        throw new HttpError(401, 'INVALID_MFA_CODE', 'The verification code is incorrect or has expired.');
      }
    }

    user.failedLogins = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
    issueSession(res, user);
    await audit(req, 'auth.login_success', { actor: user, resourceType: 'user', resourceId: user._id, metadata: { portal, mfa: user.mfa.enabled } });
    ok(res, { user: await userView(user) });
  })
);

router.post(
  '/logout',
  ah(async (req, res) => {
    try {
      const p = jwt.verify(req.cookies?.[config.cookieName] || '', config.jwtSecret, { algorithms: ['HS256'] });
      const u = await User.findById(p.sub);
      if (u) await audit(req, 'auth.logout', { actor: u, resourceType: 'user', resourceId: u._id });
    } catch { /* not signed in; still clear cookie */ }
    res.clearCookie(config.cookieName, { ...cookieOpts(0), maxAge: undefined });
    ok(res, { loggedOut: true });
  })
);

router.get('/me', authenticate, ah(async (req, res) => ok(res, { user: await userView(req.user) })));

// ---- Activation ------------------------------------------------------------
router.get(
  '/activate',
  [query('token').isString().isLength({ min: 20, max: 200 }), validate],
  ah(async (req, res) => {
    const u = await User.findOne({ activationTokenHash: sha256(req.query.token), activationExpires: { $gt: new Date() } }).select('+activationTokenHash');
    if (!u) throw new HttpError(400, 'INVALID_TOKEN', 'This activation link is invalid or has expired. Ask your bank to send a new one.');
    ok(res, { name: u.name, email: maskEmail(u.email), role: u.role });
  })
);

router.post(
  '/activate',
  [body('token').isString().isLength({ min: 20, max: 200 }), pwRule('password'), validate],
  ah(async (req, res) => {
    const u = await User.findOne({ activationTokenHash: sha256(req.body.token), activationExpires: { $gt: new Date() } }).select('+activationTokenHash');
    if (!u) throw new HttpError(400, 'INVALID_TOKEN', 'This activation link is invalid or has expired. Ask your bank to send a new one.');
    u.passwordHash = await bcrypt.hash(req.body.password, 12);
    u.status = 'active';
    u.activationTokenHash = undefined;
    u.activationExpires = undefined;
    u.passwordChangedAt = new Date();
    u.tokenVersion += 1;
    await u.save();
    if (u.role === 'client') {
      const c = await Client.findOneAndUpdate({ userId: u._id }, { status: 'active' }, { new: true });
      if (c) await inApp(c, 'Welcome', 'Your account is active. You can now view your accounts and transactions.', 'welcome');
    }
    await audit(req, 'auth.account_activated', { actor: u, resourceType: 'user', resourceId: u._id });
    ok(res, { activated: true });
  })
);

// ---- Password recovery -----------------------------------------------------
router.post(
  '/forgot-password',
  [body('email').isString().trim().toLowerCase().isEmail(), validate],
  ah(async (req, res) => {
    const u = await User.findOne({ email: req.body.email, status: 'active' });
    if (u) {
      const token = randomToken();
      u.resetTokenHash = sha256(token);
      u.resetExpires = new Date(Date.now() + config.resetMinutes * 60000);
      await u.save();
      const link = `${config.appUrl}/reset-password?token=${token}`;
      const client = u.role === 'client' ? await Client.findOne({ userId: u._id }) : null;
      await sendTemplated({
        client: client || recipientFromUser(u),
        template: 'password_reset',
        link,
        channelsToUse: client ? ['email', 'sms'] : ['email'],
      });
      await audit(req, 'auth.password_reset_requested', { actor: u, resourceType: 'user', resourceId: u._id });
    }
    // Identical response whether or not the account exists (prevents enumeration).
    ok(res, { message: 'If that email is registered, a reset link has been sent.' });
  })
);

router.post(
  '/reset-password',
  [body('token').isString().isLength({ min: 20, max: 200 }), pwRule('password'), validate],
  ah(async (req, res) => {
    const u = await User.findOne({ resetTokenHash: sha256(req.body.token), resetExpires: { $gt: new Date() } }).select('+resetTokenHash');
    if (!u) throw new HttpError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired.');
    u.passwordHash = await bcrypt.hash(req.body.password, 12);
    u.resetTokenHash = undefined;
    u.resetExpires = undefined;
    u.failedLogins = 0;
    u.lockUntil = undefined;
    u.passwordChangedAt = new Date();
    u.tokenVersion += 1; // signs out every existing session
    await u.save();
    await audit(req, 'auth.password_reset_completed', { actor: u, resourceType: 'user', resourceId: u._id });
    ok(res, { reset: true });
  })
);

router.post(
  '/change-password',
  authenticate,
  [body('currentPassword').isString().isLength({ min: 1, max: 200 }), pwRule('newPassword'), validate],
  ah(async (req, res) => {
    const u = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(req.body.currentPassword, u.passwordHash))) {
      await audit(req, 'auth.password_change_failed', { resourceType: 'user', resourceId: u._id });
      throw new HttpError(400, 'INVALID_CREDENTIALS', 'Your current password is incorrect.');
    }
    u.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    u.passwordChangedAt = new Date();
    u.tokenVersion += 1;
    await u.save();
    issueSession(res, u);
    await audit(req, 'auth.password_changed', { resourceType: 'user', resourceId: u._id });
    if (u.role === 'client') {
      const c = await Client.findOne({ userId: u._id });
      if (c) await inApp(c, 'Password changed', 'Your password was changed. If this was not you, contact us immediately.', 'security');
    }
    ok(res, { changed: true });
  })
);

// ---- Language --------------------------------------------------------------
router.patch(
  '/language',
  authenticate,
  [body('preferredLanguage').isIn(LANGUAGES), validate],
  ah(async (req, res) => {
    req.user.preferredLanguage = req.body.preferredLanguage;
    await req.user.save();
    if (req.user.role === 'client') await Client.updateOne({ userId: req.user._id }, { preferredLanguage: req.body.preferredLanguage });
    ok(res, { preferredLanguage: req.body.preferredLanguage });
  })
);

// ---- MFA (TOTP) ------------------------------------------------------------
router.post(
  '/mfa/setup',
  authenticate,
  ah(async (req, res) => {
    const u = await User.findById(req.user._id).select('+mfa.pendingSecret');
    if (u.mfa.enabled) throw new HttpError(409, 'MFA_ALREADY_ENABLED', 'Multi-factor authentication is already enabled.');
    const secret = authenticator.generateSecret();
    u.mfa.pendingSecret = encrypt(secret);
    await u.save();
    ok(res, { secret, otpauthUrl: authenticator.keyuri(u.email, config.brand, secret) });
  })
);

router.post(
  '/mfa/enable',
  authenticate,
  [body('code').isString().isLength({ min: 6, max: 10 }), validate],
  ah(async (req, res) => {
    const u = await User.findById(req.user._id).select('+mfa.pendingSecret +mfa.secret');
    if (!u.mfa.pendingSecret) throw new HttpError(400, 'MFA_NOT_STARTED', 'Start MFA setup first.');
    const secret = decrypt(u.mfa.pendingSecret);
    if (!codeOk(u, req.body.code, secret)) throw new HttpError(400, 'INVALID_MFA_CODE', 'The verification code is incorrect.');
    u.mfa.secret = u.mfa.pendingSecret;
    u.mfa.pendingSecret = undefined;
    u.mfa.enabled = true;
    await u.save();
    await audit(req, 'auth.mfa_enabled', { resourceType: 'user', resourceId: u._id });
    ok(res, { mfaEnabled: true });
  })
);

router.post(
  '/mfa/disable',
  authenticate,
  [body('password').isString().isLength({ min: 1, max: 200 }), body('code').isString().isLength({ min: 6, max: 10 }), validate],
  ah(async (req, res) => {
    if (req.user.role !== 'client' && config.enforceAdminMfa) throw new HttpError(403, 'MFA_REQUIRED', 'Staff accounts must keep MFA enabled.');
    const u = await User.findById(req.user._id).select('+passwordHash +mfa.secret');
    if (!u.mfa.enabled) throw new HttpError(409, 'MFA_NOT_ENABLED', 'MFA is not enabled.');
    const good = (await bcrypt.compare(req.body.password, u.passwordHash)) && codeOk(u, req.body.code, decrypt(u.mfa.secret));
    if (!good) throw new HttpError(400, 'INVALID_CREDENTIALS', 'Password or verification code is incorrect.');
    u.mfa.enabled = false;
    u.mfa.secret = undefined;
    await u.save();
    await audit(req, 'auth.mfa_disabled', { resourceType: 'user', resourceId: u._id });
    ok(res, { mfaEnabled: false });
  })
);

export default router;
