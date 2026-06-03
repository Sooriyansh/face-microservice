const express = require('express');

const Attendance = require('../../models/Attendance');
const Student = require('../../models/Student');
const WorkSession = require('../../models/WorkSession');
const {
  checkoutSession,
  deriveSessionStatus,
  getDateKey,
  joinWorkSession,
  recordTrackingEvent,
  setMonitoringPermission,
  startSessionAfterAttendance,
} = require('../../services/workSessions');

const router = express.Router();

function serializeSession(session) {
  if (!session) {
    return null;
  }

  const plain = typeof session.toObject === 'function' ? session.toObject() : session;
  const now = new Date();
  const startedAt = plain.startedAt ? new Date(plain.startedAt) : null;
  const checkoutAt = plain.checkoutAt ? new Date(plain.checkoutAt) : null;
  const end = checkoutAt || now;
  const elapsedMs = startedAt ? Math.max(end.getTime() - startedAt.getTime(), 0) : 0;

  return {
    ...plain,
    liveStatus: deriveSessionStatus(plain, now),
    elapsedMs,
    eventCount: Array.isArray(plain.events) ? plain.events.length : 0,
  };
}

async function getTodaySessionForEmployee(employeeId) {
  return WorkSession.findOne({
    employee: employeeId,
    dateKey: getDateKey(),
  })
    .populate('employee')
    .populate('attendance')
    .lean();
}

router.get('/today', async (req, res, next) => {
  try {
    const employeeId = req.user?.role === 'employee' ? null : req.query.employeeId;
    const employee = employeeId
      ? await Student.findById(employeeId)
      : req.user?.role === 'employee'
        ? await Student.findOne({ email: req.user.email })
        : await Student.findOne().sort({ createdAt: -1 });

    if (!employee) {
      return res.json({
        success: true,
        session: null,
        message: 'No employee profile found.',
      });
    }

    let session = await getTodaySessionForEmployee(employee._id);
    const todayAttendance = await Attendance.findOne({
      student: employee._id,
      dateKey: getDateKey(),
    });

    if (!session && todayAttendance) {
      session = await startSessionAfterAttendance({
        employee,
        attendance: todayAttendance,
        attendanceTime: todayAttendance.markedAt,
      });
      session = await WorkSession.findById(session._id).populate('employee').populate('attendance').lean();
    }

    res.json({
      success: true,
      employee,
      session: serializeSession(session),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/live', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can access live employee monitoring.',
      });
    }

    const dateKey = req.query.date || getDateKey();
    const [employees, sessions] = await Promise.all([
      Student.find().sort({ name: 1 }).lean(),
      WorkSession.find({ dateKey }).populate('employee').populate('attendance').sort({ lastActivityAt: -1 }).lean(),
    ]);
    const sessionByEmployee = new Map(sessions.map((session) => [String(session.employee?._id || session.employee), session]));

    const rows = employees.map((employee) => {
      const session = sessionByEmployee.get(String(employee._id));
      return {
        employee,
        session: serializeSession(session),
        currentStatus: session ? deriveSessionStatus(session) : 'offline',
        deviceState: session?.deviceState || 'Offline',
        lastActivity: session?.lastActivityAt || null,
        workingMs: serializeSession(session)?.elapsedMs || 0,
        laptopOnSince: session?.startedAt || null,
        activeMs: session?.activeMs || 0,
        idleMs: session?.idleMs || 0,
        sleepMs: session?.sleepMs || 0,
        attendanceTime: session?.attendanceTime || null,
        checkoutTime: session?.checkoutAt || null,
        dailyPlan: session?.dailyPlan || '',
        taskStatus: session?.taskStatus || '',
        workSummary: session?.workSummary || session?.checkoutNote || '',
        pendingWork: session?.pendingWork || '',
        productivityScore: session?.productivityScore || 0,
      };
    });

    res.json({
      success: true,
      rows,
      counts: {
        active: rows.filter((row) => row.currentStatus === 'active').length,
        idle: rows.filter((row) => row.currentStatus === 'idle').length,
        checkedOut: rows.filter((row) => row.currentStatus === 'checked_out').length,
        offline: rows.filter((row) => row.currentStatus === 'offline' || row.currentStatus === 'incomplete').length,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/join', async (req, res, next) => {
  try {
    const employee = req.user?.role === 'employee'
      ? await Student.findOne({ email: req.user.email })
      : await Student.findById(req.body.employeeId);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee profile was not found.' });
    }

    const session = await joinWorkSession({
      employee,
      dailyPlan: req.body.dailyPlan,
      joinedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Work session started successfully.',
      session: serializeSession(await WorkSession.findById(session._id).populate('employee').populate('attendance').lean()),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
});

router.post('/:sessionId/checkout', async (req, res, next) => {
  try {
    const session = await checkoutSession(req.params.sessionId, req.body);
    res.json({
      success: true,
      message: "Today's work session completed successfully.",
      session: serializeSession(session),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

router.post('/:sessionId/permission', async (req, res, next) => {
  try {
    const session = await setMonitoringPermission(req.params.sessionId, req.body.permission);
    res.json({
      success: true,
      session: serializeSession(session),
      message:
        session.monitoringPermission === 'allowed'
          ? 'Monitoring permission allowed.'
          : 'Monitoring permission denied. Attendance will continue without device monitoring.',
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }
    next(error);
  }
});

router.post('/activity', async (req, res, next) => {
  try {
    if (req.user?.role === 'employee') {
      const employee = await Student.findOne({ email: req.user.email }).lean();
      if (!employee || String(employee._id) !== String(req.body.employee)) {
        return res.status(403).json({
          success: false,
          message: 'Employees can send monitoring events only for their own session.',
        });
      }
    }

    const session = await recordTrackingEvent({
      ...req.body,
      type: req.body.type || req.body.event,
      event: req.body.event || req.body.type,
      occurredAt: req.body.occurredAt || new Date(),
    });

    res.status(session ? 201 : 202).json({
      success: true,
      tracked: Boolean(session),
      session: serializeSession(session),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

