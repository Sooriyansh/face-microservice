const express = require('express');
const Attendance = require('../../models/Attendance');
const Student = require('../../models/Student');
const { runRecognition } = require('../../services/faceRecognition');
const { rowsToCsv } = require('../../services/hrms');
const { notifyEmployee } = require('../../services/notifications');
const { startSessionAfterAttendance } = require('../../services/workSessions');

const router = express.Router();

function sendAttendanceExport(res, type, rows) {
  const headers = [
    { label: 'Employee', value: (row) => row.student?.name || row.faceLabel },
    { label: 'Face Label', value: (row) => row.faceLabel },
    { label: 'Marked At', value: (row) => new Date(row.markedAt).toLocaleString() },
    { label: 'Confidence', value: (row) => Number(row.confidence || 0).toFixed(3) },
    {
      label: 'Location',
      value: (row) =>
        row.location?.latitude != null && row.location?.longitude != null
          ? `${row.location.latitude}, ${row.location.longitude}`
          : '-',
    },
    { label: 'Status', value: (row) => row.status || 'Present' },
  ];

  if (type === 'pdf') {
    res.type('html');
    return res.send(`<!doctype html><html><head><title>Attendance Logs</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eef}</style></head><body><h1>Attendance Logs</h1><table><thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${h.value(row)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.print()</script></body></html>`);
  }

  const extension = type === 'excel' ? 'xls' : 'csv';
  res.setHeader('Content-Disposition', `attachment; filename="attendance-logs.${extension}"`);
  res.type(type === 'excel' ? 'application/vnd.ms-excel' : 'text/csv');
  return res.send(rowsToCsv(rows, headers));
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') {
    return undefined;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }

  const capturedAt = location.capturedAt ? new Date(location.capturedAt) : new Date();

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    capturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt,
  };
}

async function markAttendanceForLabel(faceLabel, confidence = 0, markedAt, location) {
  const student = await Student.findOne({ faceLabel });

  if (!student) {
    return {
      status: 404,
      body: {
        success: false,
        message: `No student found for label ${faceLabel}`,
      },
    };
  }

  const attendanceTime = markedAt ? new Date(markedAt) : new Date();
  const dateKey = attendanceTime.toISOString().slice(0, 10);

  const existing = await Attendance.findOne({
    student: student._id,
    dateKey,
  }).lean();

  if (existing) {
    await startSessionAfterAttendance({
      employee: student,
      attendance: existing,
      attendanceTime: existing.markedAt,
    });

    return {
      status: 200,
      body: {
        success: true,
        duplicate: true,
        message: 'Attendance already marked for today',
        record: existing,
      },
    };
  }

  const record = await Attendance.create({
    student: student._id,
    faceLabel,
    confidence,
    markedAt: attendanceTime,
    dateKey,
    location: normalizeLocation(location),
  });

  const populated = await Attendance.findById(record._id).populate('student').lean();
  await startSessionAfterAttendance({
    employee: student,
    attendance: record,
    attendanceTime,
  });
  await notifyEmployee(student, {
    title: 'Attendance Marked',
    message: 'Your attendance has been marked successfully.',
    type: 'Attendance',
    priority: 'normal',
    actionUrl: '/employee#daily-work-session',
    metadata: { attendanceId: record._id, dateKey },
  });

  return {
    status: 201,
    body: {
      success: true,
      duplicate: false,
      message: 'Attendance marked successfully',
      record: populated,
    },
  };
}

router.get('/', async (req, res, next) => {
  try {
    const dateKey = req.query.date || new Date().toISOString().slice(0, 10);
    const employee = req.user?.role === 'employee' ? await Student.findOne({ email: req.user.email }).lean() : null;
    const query = employee ? { dateKey, student: employee._id } : { dateKey };
    const records = await Attendance.find(query)
      .sort({ markedAt: -1 })
      .populate('student')
      .lean();

    res.json({ success: true, records });
  } catch (error) {
    next(error);
  }
});

router.get('/export/:type', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can export attendance logs.' });
    }

    const dateKey = req.query.date || new Date().toISOString().slice(0, 10);
    const records = await Attendance.find({ dateKey }).sort({ markedAt: -1 }).populate('student').lean();
    return sendAttendanceExport(res, req.params.type, records);
  } catch (error) {
    next(error);
  }
});

router.post('/mark', async (req, res, next) => {
  try {
    const { faceLabel, confidence = 0, markedAt, location } = req.body;

    if (!faceLabel) {
      return res.status(400).json({
        success: false,
        message: 'faceLabel is required',
      });
    }

    if (req.user?.role === 'employee') {
      const employee = await Student.findOne({ email: req.user.email }).lean();
      if (!employee || employee.faceLabel !== faceLabel) {
        return res.status(403).json({
          success: false,
          message: 'Employees can mark attendance only for their own face profile.',
        });
      }
    }

    const result = await markAttendanceForLabel(faceLabel, confidence, markedAt, location);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

router.post('/scan', async (req, res, next) => {
  try {
    const { image, location } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'image is required',
      });
    }

    const [, encoded] = image.split(',');
    if (!encoded) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image payload',
      });
    }

    let recognition;

    try {
      const imageBuffer = Buffer.from(encoded, 'base64');
      recognition = await runRecognition(imageBuffer);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message:
          'Python recognition service is unavailable. On Render, make sure the latest deploy installed Python dependencies during npm install. Locally, run `npm run setup:python` and then retry.',
        details: error.message,
      });
    }

    if (!recognition.success) {
      return res.status(500).json({
        success: false,
        message: recognition.message || 'Recognition failed',
      });
    }

    if (!recognition.matched) {
      return res.json({
        success: true,
        recognized: false,
        message: recognition.message || 'Face not recognized',
        confidence: recognition.confidence || 0,
        box: recognition.box || null,
        quality: recognition.quality || null,
        quality_issues: recognition.quality_issues || [],
        stage: recognition.stage || 'not_matched',
      });
    }

    if (req.user?.role === 'employee') {
      const employee = await Student.findOne({ email: req.user.email }).lean();
      if (!employee || employee.faceLabel !== recognition.label) {
        return res.status(403).json({
          success: false,
          recognized: false,
          message: 'Recognized face does not match the logged-in employee account.',
          confidence: recognition.confidence || 0,
        });
      }
    }

    const attendanceResult = await markAttendanceForLabel(recognition.label, recognition.confidence, undefined, location);

    return res.status(attendanceResult.status).json({
      ...attendanceResult.body,
      recognized: true,
      recognition: {
        label: recognition.label,
        confidence: recognition.confidence,
        box: recognition.box,
        quality: recognition.quality || null,
        quality_issues: recognition.quality_issues || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

