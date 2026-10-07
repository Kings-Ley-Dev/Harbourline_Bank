import mongoose from 'mongoose';
import { LANGUAGES, PERMISSIONS } from '../config.js';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ['super_admin', 'admin', 'client'], required: true, index: true },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending', index: true },
    permissions: [{ type: String, enum: PERMISSIONS }],
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false }, // AES-256-GCM encrypted
      pendingSecret: { type: String, select: false },
      lastUsedStep: { type: Number, default: 0 },
    },
    activationTokenHash: { type: String, select: false },
    activationExpires: Date,
    resetTokenHash: { type: String, select: false },
    resetExpires: Date,
    failedLogins: { type: Number, default: 0 },
    lockUntil: Date,
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ activationTokenHash: 1 }, { sparse: true });
userSchema.index({ resetTokenHash: 1 }, { sparse: true });

export default mongoose.models.User || mongoose.model('User', userSchema);
