import mongoose from 'mongoose';

const txSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    category: { type: String, default: 'general', maxlength: 40 },
    description: { type: String, required: true, maxlength: 140 },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, required: true },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'reversed'], default: 'completed' },
    balanceAfter: Number,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

txSchema.index({ clientId: 1, createdAt: -1 });
txSchema.index({ accountId: 1, createdAt: -1 });

export default mongoose.models.Transaction || mongoose.model('Transaction', txSchema);
