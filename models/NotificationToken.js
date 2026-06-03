const mongoose = require('mongoose');

const webPushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, default: '' },
      auth: { type: String, default: '' },
    },
  },
  { _id: false }
);

const notificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['admin', 'employee'],
      required: true,
      index: true,
    },
    fcmToken: {
      type: String,
      trim: true,
      index: true,
    },
    webPushSubscription: {
      type: webPushSubscriptionSchema,
      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      default: '',
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

notificationTokenSchema.index({ userId: 1, fcmToken: 1 }, { unique: true, sparse: true });
notificationTokenSchema.index({ userId: 1, 'webPushSubscription.endpoint': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('NotificationToken', notificationTokenSchema);
