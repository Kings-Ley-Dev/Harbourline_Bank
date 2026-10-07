import mongoose from 'mongoose';
import { CURRENCIES } from '../config.js';

// All monetary values are stored as integers in minor units (e.g. pesewas/cents).
const accountSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    accountNumber: { type: String, required: true, unique: true },
    reference: { type: String, required: true }, // customer/account reference
    type: { type: String, enum: ['current', 'savings', 'fixed_deposit'], default: 'current' },
    currency: { type: String, enum: CURRENCIES, default: 'GHS' },
    balance: { type: Number, default: 0, validate: Number.isInteger },
    status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active' },
  },
  { timestamps: true }
);

export default mongoose.models.Account || mongoose.model('Account', accountSchema);
