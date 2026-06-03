const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'recipientModel',
      default: null,
      index: true,
    },
    recipientModel: {
      type: String,
      enum: ['User', 'Student'],
      default: 'User',
    },
    recipientRole: {
      type: String,
      enum: ['admin', 'employee'],
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'senderModel',
      default: null,
    },
    senderModel: {
      type: String,
      enum: ['User', 'Student'],
      default: 'User',
    },
    senderRole: {
      type: String,
      enum: ['system', 'admin', 'employee'],
      default: 'system',
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: [
        'Attendance',
        'Login Reminder',
        'Leave Request',
        'Leave Approved',
        'Leave Rejected',
        'Daily Report',
        'Checkout',
        'Overtime',
        'System Alert',
        'General',
      ],
      default: 'General',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    actionUrl: {
      type: String,
      trim: true,
      default: '',
    },
    delivery: {
      inApp: { type: Boolean, default: true },
      realtime: { type: Boolean, default: true },
      fcm: { type: Boolean, default: false },
      webPush: { type: Boolean, default: false },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientRole: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
