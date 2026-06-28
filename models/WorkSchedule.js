const mongoose = require('mongoose');

const workScheduleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default',
      unique: true,
      immutable: true,
    },
    officeJoinTime: {
      type: String,
      default: '08:00',
      trim: true,
    },
    checkOutTime: {
      type: String,
      default: '17:00',
      trim: true,
    },
    workingHours: {
      type: Number,
      default: 8,
      min: 1,
      max: 24,
    },
    breakMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    gracePeriodMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    overtimeStartTime: {
      type: String,
      default: '17:00',
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkSchedule', workScheduleSchema);
