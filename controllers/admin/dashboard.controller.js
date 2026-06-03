const Attendance = require('../../models/Attendance');
const DailyWorkReport = require('../../models/DailyWorkReport');
const LeaveRequest = require('../../models/LeaveRequest');
const Student = require('../../models/Student');
const SystemEvent = require('../../models/SystemEvent');
const WorkSession = require('../../models/WorkSession');

async function dashboard(req, res, next) {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const [studentCount, todayAttendanceCount, recentAttendance, students, liveSessions] = await Promise.all([
      Student.countDocuments(),
      Attendance.countDocuments({ dateKey: todayKey }),
      Attendance.find().sort({ markedAt: -1 }).limit(8).populate('student').lean(),
      Student.find().sort({ createdAt: -1 }).lean(),
      WorkSession.find({ dateKey: todayKey }).populate('employee').populate('attendance').lean(),
    ]);
    const systemEventCount = await SystemEvent.countDocuments();

    res.render('admin/dashboard', {
      studentCount,
      todayAttendanceCount,
      recentAttendance,
      safeRecentAttendance: Array.isArray(recentAttendance) ? recentAttendance : [],
      students,
      systemEventCount,
      liveSessions,
    });
  } catch (error) {
    next(error);
  }
}

async function attendancePage(req, res, next) {
  try {
    const records = await Attendance.find().sort({ markedAt: -1 }).limit(20).populate('student').lean();
    res.render('admin/attendance', { records });
  } catch (error) {
    next(error);
  }
}

async function systemEventsPage(req, res, next) {
  try {
    const now = new Date();
    const workdayStart = new Date(now);
    workdayStart.setHours(8, 0, 0, 0);
    const workdayEnd = new Date(now);
    workdayEnd.setHours(17, 0, 0, 0);
    const rangeEnd = now < workdayEnd ? now : workdayEnd;

    const [systemEvents, students, liveSessions] = await Promise.all([
      SystemEvent.find({ occurredAt: { $gte: workdayStart, $lte: rangeEnd } }).sort({ occurredAt: 1 }).limit(500).lean(),
      Student.find().sort({ name: 1 }).lean(),
      WorkSession.find({ dateKey: now.toISOString().slice(0, 10) }).populate('employee').populate('attendance').lean(),
    ]);

    res.render('admin/system-events', {
      systemEvents,
      students,
      systemEventRange: {
        start: workdayStart,
        end: rangeEnd,
        workdayEnd,
      },
      liveSessions,
    });
  } catch (error) {
    next(error);
  }
}

async function leaveManagementPage(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [leaves, totalEmployees] = await Promise.all([
      LeaveRequest.find().sort({ createdAt: -1 }).populate('employee').lean(),
      Student.countDocuments(),
    ]);

    const departmentStats = leaves.reduce((stats, leave) => {
      const department = leave.employee?.department || 'Unassigned';
      stats[department] = (stats[department] || 0) + 1;
      return stats;
    }, {});

    res.render('admin/leave-management', {
      leaves,
      totalEmployees,
      analytics: {
        total: leaves.length,
        approved: leaves.filter((leave) => leave.status === 'Approved').length,
        rejected: leaves.filter((leave) => leave.status === 'Rejected').length,
        onLeaveToday: leaves.filter((leave) => leave.status === 'Approved' && new Date(leave.startDate) < tomorrow && new Date(leave.endDate) >= today).length,
        departmentStats,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function dailyReportsPage(req, res, next) {
  try {
    const query = {};
    if (req.query.date) query.reportDate = String(req.query.date);
    if (req.query.status) query.taskStatus = String(req.query.status);

    const [reports, students] = await Promise.all([
      DailyWorkReport.find(query).sort({ createdAt: -1 }).limit(500).populate('employee').populate('workSession').lean(),
      Student.find().sort({ name: 1 }).lean(),
    ]);

    const filteredReports = reports.filter((report) => {
      const employeeId = String(report.employee?._id || report.employee || '');
      const department = report.employee?.department || '';
      return (!req.query.employee || employeeId === String(req.query.employee)) &&
        (!req.query.department || department === String(req.query.department));
    });

    res.render('admin/daily-reports', {
      reports: filteredReports,
      students,
      filters: {
        date: req.query.date || '',
        employee: req.query.employee || '',
        department: req.query.department || '',
        status: req.query.status || '',
      },
    });
  } catch (error) {
    next(error);
  }
}

async function overtimePage(req, res, next) {
  try {
    const sessions = await WorkSession.find().sort({ dateKey: -1 }).limit(1000).populate('employee').lean();
    const byEmployee = new Map();
    sessions.forEach((session) => {
      const employee = session.employee || {};
      const key = String(employee._id || session.employee);
      const row = byEmployee.get(key) || {
        employeeName: employee.name || 'Employee',
        department: employee.department || '-',
        totalWorkingMs: 0,
        overtimeMs: 0,
        weekendMs: 0,
      };
      row.totalWorkingMs += Number(session.totalWorkingMs || 0);
      row.overtimeMs += Number(session.overtimeMs || 0);
      row.weekendMs += Number(session.weekendMs || 0);
      byEmployee.set(key, row);
    });
    res.render('admin/overtime', { rows: Array.from(byEmployee.values()).sort((a, b) => b.overtimeMs - a.overtimeMs), sessions });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  attendancePage,
  dailyReportsPage,
  dashboard,
  leaveManagementPage,
  overtimePage,
  systemEventsPage,
};
