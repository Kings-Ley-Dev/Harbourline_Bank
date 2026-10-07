// Usage:
//   node server/scripts/seed.js                 -> creates the Super Admin only (production-safe)
//   node server/scripts/seed.js --demo          -> also creates a demo staff user, demo client and sample transactions
// Env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (random password is generated and printed once if omitted)
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { connectDB } from '../db.js';
import { User, Client, Account } from '../models/index.js';
import { postTransaction, newAccountNumber } from '../services/ledger.js';
import { PERMISSIONS } from '../config.js';

const demo = process.argv.includes('--demo');
if (config.prod && demo) {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}
await connectDB();

const randomPw = () => `${crypto.randomBytes(9).toString('base64url')}#9aZ`;

async function upsertUser({ email, name, role, password, permissions = [], language = 'en' }) {
  let u = await User.findOne({ email });
  if (u) return { user: u, created: false };
  u = await User.create({ email, name, role, status: 'active', permissions, preferredLanguage: language, passwordHash: await bcrypt.hash(password, 12), passwordChangedAt: new Date() });
  return { user: u, created: true };
}

const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@harbourline.example').toLowerCase();
const adminPw = process.env.SEED_ADMIN_PASSWORD || randomPw();
const sa = await upsertUser({ email: adminEmail, name: 'Super Admin', role: 'super_admin', password: adminPw });
console.log(sa.created ? `Super Admin created: ${adminEmail}  password: ${process.env.SEED_ADMIN_PASSWORD ? '(from SEED_ADMIN_PASSWORD)' : adminPw}` : `Super Admin already exists: ${adminEmail}`);
if (sa.created && config.enforceAdminMfa) console.log('Production note: you will be asked to enrol in MFA at first sign-in.');

if (demo) {
  const staffPw = 'Staff#Demo2026';
  const staff = await upsertUser({ email: 'staff@harbourline.example', name: 'Ama Mensah', role: 'admin', password: staffPw, permissions: PERMISSIONS.filter((p) => !['audit:read', 'accounts:manage'].includes(p)) });
  console.log(staff.created ? `Demo staff created: staff@harbourline.example  password: ${staffPw}` : 'Demo staff exists');

  const clientPw = 'Client#Demo2026';
  const cu = await upsertUser({ email: 'client@harbourline.example', name: 'Kofi Boateng', role: 'client', password: clientPw });
  if (cu.created) {
    const c = await Client.create({ userId: cu.user._id, customerId: 'HB10000001', firstName: 'Kofi', lastName: 'Boateng', email: 'client@harbourline.example', phone: '+233241234567', country: 'GH', preferredLanguage: 'en', status: 'active' });
    const cur = await Account.create({ clientId: c._id, accountNumber: await newAccountNumber(), reference: c.customerId, type: 'current', currency: 'GHS' });
    const sav = await Account.create({ clientId: c._id, accountNumber: await newAccountNumber(), reference: c.customerId, type: 'savings', currency: 'GHS' });
    const day = (n) => new Date(Date.now() - n * 86400000);
    const seq = [
      [cur, 'credit', 850000, 'Salary – Meridian Logistics Ltd', 'salary', 58],
      [cur, 'debit', 120000, 'Rent – Osu apartment', 'housing', 56],
      [cur, 'debit', 18450, 'Shoprite Accra Mall', 'groceries', 52],
      [cur, 'debit', 6000, 'MTN Mobile Data', 'utilities', 49],
      [cur, 'credit', 850000, 'Salary – Meridian Logistics Ltd', 'salary', 28],
      [cur, 'debit', 120000, 'Rent – Osu apartment', 'housing', 26],
      [cur, 'debit', 24300, 'ECG Prepaid Electricity', 'utilities', 22],
      [cur, 'debit', 9550, 'Bolt rides', 'transport', 15],
      [cur, 'credit', 35000, 'Transfer from A. Boateng', 'transfer', 9],
      [cur, 'debit', 21500, 'Melcom Home', 'shopping', 6],
      [cur, 'debit', 15800, 'Zeeba Restaurant', 'dining', 3],
      [sav, 'credit', 300000, 'Transfer to savings', 'transfer', 57],
      [sav, 'credit', 200000, 'Transfer to savings', 'transfer', 27],
      [sav, 'credit', 4120, 'Interest credited', 'interest', 2],
    ];
    for (const [a, type, amount, description, category, ago] of seq) {
      await postTransaction({ accountId: a._id, type, amount, description, category, createdBy: sa.user._id, createdAt: day(ago) });
    }
    console.log(`Demo client created: client@harbourline.example  password: ${clientPw}  (customer ID HB10000001)`);
  } else console.log('Demo client exists');
}

await mongoose.disconnect();
