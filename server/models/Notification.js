import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    channel: { type: String, enum: ['email', 'whatsapp', 'sms', 'in_app'], required: true },
    recipient: { type: String, required: true },
    template: { type: String, required: true },
    title: String,
    body: String, // only stored for in_app notifications (never contains secrets)
    status: { type: String, enum: ['queued', 'sent', 'failed', 'skipped'], default: 'queued' },
    providerResponse: mongoose.Schema.Types.Mixed, // sanitised: no tokens/links
    read: { type: Boolean, default: false },
    sentAt: Date,
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

notificationSchema.index({ clientId: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
