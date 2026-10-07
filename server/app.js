import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { connectDB } from './db.js';
import { config } from './config.js';
import { HttpError, ah } from './utils.js';
import { sanitizeInput, sameOriginWrites } from './middleware.js';
import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import clientRoutes from './routes/client.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// Strict CSP only on API responses; the SPA's CSP is set by vercel.json (and dev.js locally).
app.use(helmet({ contentSecurityPolicy: false }));
app.use('/api', (req, res, next) => { res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); next(); });
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(sanitizeInput);
app.use(sameOriginWrites);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const limiter = (windowMin, max) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' } }),
  });
// NOTE: in-memory counters are per serverless instance. Per-account lockout (stored in MongoDB) is the
// cross-instance control; use a shared store (e.g. Upstash Redis) for stricter global limits in production.
app.use('/api', limiter(15, 600));
app.use(['/api/auth/login', '/api/auth/activate', '/api/auth/forgot-password', '/api/auth/reset-password'], limiter(15, 40));

app.use('/api', ah(async (req, res, next) => { await connectDB(); next(); }));

app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
// SRS alias: GET /api/accounts is the client's account list.
app.use('/api/accounts', (req, res, next) => { req.url = '/accounts'; clientRoutes(req, res, next); });

app.use('/api', (req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found.')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let code = err.code && typeof err.code === 'string' ? err.code : 'INTERNAL';
  let message = err.message;
  let details = err.details;
  if (err.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Malformed JSON body.'; }
  else if (err.type === 'entity.too.large') { status = 413; code = 'TOO_LARGE'; message = 'Request body too large.'; }
  else if (err.code === 11000) { status = 409; code = 'DUPLICATE'; message = 'A record with these details already exists.'; }
  else if (err.name === 'CastError') { status = 400; code = 'BAD_REQUEST'; message = 'Invalid identifier.'; }
  else if (err.name === 'ValidationError') { status = 422; code = 'VALIDATION_ERROR'; message = 'Some fields are invalid.'; details = Object.values(err.errors || {}).map((e) => ({ field: e.path, message: e.message })); }
  else if (!(err instanceof HttpError)) { status = 500; code = 'INTERNAL'; message = 'Something went wrong. Please try again.'; }
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err.name, err.message); // never logs bodies/tokens
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
});

export default app;
