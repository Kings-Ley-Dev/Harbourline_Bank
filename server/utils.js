import crypto from 'node:crypto';  
import { config } from './config.js'; 
 
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const ok = (res, data = {}, status = 200) => res.status(status).json({ success: true, data });

export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const aesKey = () => crypto.createHash('sha256').update(config.encryptionKey).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', aesKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const COMMON = ['password123', 'qwerty12345', 'letmein1234', 'welcome1234', 'admin12345'];

/** Returns an array of problems (empty when the password is acceptable). */
export function passwordProblems(pw = '') {
  const p = [];
  if (typeof pw !== 'string' || pw.length < 10) p.push('at least 10 characters');
  if (!/[a-z]/.test(pw)) p.push('a lowercase letter');
  if (!/[A-Z]/.test(pw)) p.push('an uppercase letter');
  if (!/\d/.test(pw)) p.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) p.push('a symbol');
  if (COMMON.some((c) => String(pw).toLowerCase().includes(c))) p.push('to not be a common password');
  return p;
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const pageParams = (q, defLimit = 20) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const randomDigits = (n) => {
  let s = '';
  while (s.length < n) s += crypto.randomInt(0, 10);
  return s;
};

/** Mongo operator-injection guard: strips keys beginning with "$" or containing "." from plain input. */
export function sanitize(obj) {
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return obj;
}

export const maskEmail = (e = '') => e.replace(/^(.).*(@.*)$/, '$1***$2');
export const maskPhone = (p = '') => (p.length > 6 ? `${p.slice(0, 4)}•••${p.slice(-3)}` : '•••');
