import { Account, Transaction } from '../models/index.js';
import { HttpError, randomDigits } from '../utils.js';

export const newTxRef = () => `TX${Date.now().toString(36).toUpperCase()}${randomDigits(5)}`;

export async function newAccountNumber() {
  for (let i = 0; i < 10; i++) {
    const n = randomDigits(10);
    if (!(await Account.exists({ accountNumber: n }))) return n;
  }
  throw new HttpError(500, 'INTERNAL', 'Could not allocate an account number.');
}

/**
 * Post a completed transaction against an account.
 * The balance is updated with a single atomic conditional $inc (debits can never overdraw),
 * and compensated if the transaction record cannot be written.
 */
export async function postTransaction({ accountId, type, amount, description, category = 'general', createdBy, createdAt }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpError(422, 'VALIDATION_ERROR', 'Amount must be a positive integer in minor units.');
  const acct = await Account.findById(accountId);
  if (!acct) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
  if (acct.status !== 'active') throw new HttpError(409, 'ACCOUNT_NOT_ACTIVE', 'This account is not active.');

  const delta = type === 'credit' ? amount : -amount;
  const filter = { _id: acct._id, status: 'active' };
  if (type === 'debit') filter.balance = { $gte: amount };
  const updated = await Account.findOneAndUpdate(filter, { $inc: { balance: delta } }, { new: true });
  if (!updated) throw new HttpError(409, 'INSUFFICIENT_FUNDS', 'Insufficient available balance for this debit.');

  try {
    return await Transaction.create({
      reference: newTxRef(),
      accountId: acct._id,
      clientId: acct.clientId,
      type,
      amount,
      currency: acct.currency,
      description,
      category,
      status: 'completed',
      balanceAfter: updated.balance,
      createdBy,
      ...(createdAt ? { createdAt } : {}),
    });
  } catch (e) {
    await Account.updateOne({ _id: acct._id }, { $inc: { balance: -delta } });
    throw e;
  }
}
