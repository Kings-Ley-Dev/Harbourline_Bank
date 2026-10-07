import mongoose from 'mongoose';
import { LANGUAGES } from '../config.js';

const clientSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    customerId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    country: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.models.Client || mongoose.model('Client', clientSchema);
