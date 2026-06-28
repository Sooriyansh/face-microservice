const mongoose = require('mongoose');
const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    faceLabel: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      default: 0,
    },
    matchAccuracy: {
      type: Number,
      default: 0,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    joinTime: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    dateKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: 'Present',
    },
    attendanceStatus: {
      type: String,
      default: 'Present',
      trim: true,
    },
    deviceName: {
      type: String,
      default: '',
      trim: true,
    },
    recognitionMethod: {
      type: String,
      default: 'Face Recognition',
      trim: true,
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
    overtimeMinutes: {
      type: Number,
      default: 0,
    },
    location: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      accuracy: {
        type: Number,
        default: null,
      },
      capturedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

attendanceSchema.index({ student: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
