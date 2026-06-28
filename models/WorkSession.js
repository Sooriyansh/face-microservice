const mongoose = require('mongoose');

const activityEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['system', 'productivity', 'attendance', 'session'],
      default: 'system',
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    deviceInfo: {
      type: String,
      default: '',
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const workSessionSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    attendance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      default: null,
    },
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'idle', 'sleep', 'break', 'checked_out', 'offline', 'incomplete'],
      default: 'pending',
      index: true,
    },
    deviceState: {
      type: String,
      default: 'Waiting',
      trim: true,
    },
    attendanceTime: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    lastActivityAt: {
      type: Date,
      default: null,
    },
    checkoutAt: {
      type: Date,
      default: null,
    },
    dailyPlan: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },
    taskStatus: {
      type: String,
      enum: ['Completed', 'Partially Completed', 'Pending', ''],
      default: '',
    },
    workSummary: {
      type: String,
      default: '',
      trim: true,
      maxlength: 5000,
    },
    pendingWork: {
      type: String,
      default: '',
      trim: true,
      maxlength: 4000,
    },
    additionalNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 3000,
    },
    checkoutNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 3000,
    },
    activeMs: {
      type: Number,
      default: 0,
    },
    idleMs: {
      type: Number,
      default: 0,
    },
    inactiveMs: {
      type: Number,
      default: 0,
    },
    sleepMs: {
      type: Number,
      default: 0,
    },
    monitoringPermission: {
      type: String,
      enum: ['pending', 'allowed', 'denied'],
      default: 'pending',
      index: true,
    },
    productivityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalWorkingMs: {
      type: Number,
      default: 0,
    },
    overtimeMs: {
      type: Number,
      default: 0,
    },
    lateMs: {
      type: Number,
      default: 0,
    },
    lateByMinutes: {
      type: Number,
      default: 0,
    },
    lateStatus: {
      type: String,
      default: 'On Time',
      trim: true,
    },
    weekendMs: {
      type: Number,
      default: 0,
    },
    holidayMs: {
      type: Number,
      default: 0,
    },
    standardShiftMs: {
      type: Number,
      default: 8 * 60 * 60 * 1000,
    },
    incompleteReason: {
      type: String,
      default: '',
      trim: true,
    },
    events: {
      type: [activityEventSchema],
      default: [],
    },
  },
  { timestamps: true }
);

workSessionSchema.index({ employee: 1, dateKey: 1 }, { unique: true });
workSessionSchema.index({ status: 1, lastActivityAt: -1 });

module.exports = mongoose.model('WorkSession', workSessionSchema);
