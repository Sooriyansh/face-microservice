const mongoose = require('mongoose');

const dailyWorkReportSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    workSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkSession',
      required: true,
      index: true,
    },
    attendance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      default: null,
    },
    reportDate: {
      type: String,
      required: true,
      index: true,
    },
    joinTime: {
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
      enum: ['Completed', 'Partially Completed', 'Pending'],
      default: 'Pending',
      index: true,
    },
    workSummary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    completedTasks: {
      type: [String],
      default: [],
    },
    pendingTasks: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    tomorrowPlan: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    additionalNotes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 3000,
    },
    checkoutTime: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

dailyWorkReportSchema.index({ employee: 1, reportDate: 1 }, { unique: true });

module.exports = mongoose.model('DailyWorkReport', dailyWorkReportSchema);
