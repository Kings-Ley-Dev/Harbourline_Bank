import 'dotenv/config';   

const env = process.env;
const prod = env.NODE_ENV === 'production';

if (prod && !env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));

export const config = {
  prod,
  brand: env.BRAND_NAME || 'Harbourline Bank',
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/harbourline',
  jwtSecret: env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  encryptionKey: env.ENCRYPTION_KEY || env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  appUrl: (env.APP_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:5173')).replace(/\/$/, ''),
  cookieName: 'hb_session',
  sessionHours: Number(env.SESSION_HOURS || 8),
  activationHours: Number(env.ACTIVATION_HOURS || 72),
  resetMinutes: Number(env.RESET_MINUTES || 30),
  // Administrators must enrol in MFA (enforced by default in production).
  enforceAdminMfa: bool(env.ENFORCE_ADMIN_MFA, prod),
  statementsEnabled: bool(env.STATEMENTS_ENABLED, true),
  // Only ever true outside production: lets developers copy activation links from API responses.
  exposeDevLinks: !prod && bool(env.EXPOSE_DEV_LINKS, true),
  maxFailedLogins: 5,
  lockMinutes: 15,
  notify: {
    email: {
      provider: env.EMAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : ''),
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    },
    whatsapp: {
      token: env.WHATSAPP_TOKEN,
      phoneId: env.WHATSAPP_PHONE_ID,
      template: env.WHATSAPP_TEMPLATE_ACCOUNT_CREATED || 'account_created',
      apiVersion: env.WHATSAPP_API_VERSION || 'v20.0',
    },
    sms: {
      provider: env.SMS_PROVIDER || '', // 'twilio' | 'arkesel'
      twilioSid: env.TWILIO_ACCOUNT_SID,
      twilioToken: env.TWILIO_AUTH_TOKEN,
      twilioFrom: env.TWILIO_FROM,
      arkeselKey: env.ARKESEL_API_KEY,
      senderId: env.SMS_SENDER_ID || 'Harbourline',
    },
  },
};

export const LANGUAGES = ['en', 'fr', 'es', 'pt', 'ar'];
export const CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP', 'NGN', 'AUD'];
export const PERMISSIONS = [
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:suspend',
  'accounts:manage',
  'transactions:read',
  'transactions:write',
  'notifications:send',
  'audit:read',
];
