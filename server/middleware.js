import jwt from 'jsonwebtoken';   
import { validationResult } from 'express-validator';  
import { config } from './config.js';
import { HttpError, ah, sanitize } from './utils.js';
import { User, Client } from './models/index.js';

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), v: user.tokenVersion, role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(config.cookieName, token, cookieOpts(config.sessionHours * 3600 * 1000));
}

export const cookieOpts = (maxAge) => ({ httpOnly: true, secure: config.prod, sameSite: 'strict', path: '/', maxAge });

export const authenticate = ah(async (req, res, next) => {
  const token = req.cookies?.[config.cookieName];
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active' || user.tokenVersion !== payload.v) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Your session is no longer valid. Please sign in again.');
  }
  req.user = user;
  const staff = user.role !== 'client';
  if (staff && config.enforceAdminMfa && !user.mfa.enabled && !req.originalUrl.startsWith('/api/auth/')) {
    throw new HttpError(403, 'MFA_SETUP_REQUIRED', 'Multi-factor authentication must be enabled for staff accounts.');
  }
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'FORBIDDEN', 'You do not have access to this resource.'));
  next();
};

export const requirePermission = (...perms) => (req, res, next) => {
  const u = req.user;
  if (u.role === 'super_admin') return next();
  if (u.role === 'admin' && perms.every((p) => u.permissions.includes(p))) return next();
  next(new HttpError(403, 'FORBIDDEN', 'Your role does not permit this action.'));
};

export const loadClient = ah(async (req, res, next) => {
  const client = await Client.findOne({ userId: req.user._id });
  if (!client) throw new HttpError(404, 'NOT_FOUND', 'Client profile not found.');
  req.client = client; // every client-route query is scoped by req.client._id
  next();
});

export const validate = (req, res, next) => {
  const r = validationResult(req);
  if (r.isEmpty()) return next();
  const details = r.array().map((e) => ({ field: e.path, message: e.msg }));
  next(new HttpError(422, 'VALIDATION_ERROR', 'Some fields are invalid.', details));
};

/** Strip Mongo operators from body and query. */
export const sanitizeInput = (req, res, next) => {
  if (req.body) req.body = sanitize(req.body);
  const q = sanitize({ ...req.query });
  Object.defineProperty(req, 'query', { value: q, writable: true, configurable: true, enumerable: true });
  next();
};

/** CSRF defence in depth (on top of SameSite=Strict): state-changing requests must be same-origin JSON. */
export const sameOriginWrites = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('x-forwarded-host') || req.get('host');
    let oh;
    try { oh = new URL(origin).host; } catch { oh = ''; }
    const allowed = new Set([host, new URL(config.appUrl).host]);
    if (!allowed.has(oh)) return next(new HttpError(403, 'BAD_ORIGIN', 'Cross-origin requests are not allowed.'));
  }
  if (req.body && Object.keys(req.body).length && !req.is('application/json')) {
    return next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.'));
  }
  next();
};
