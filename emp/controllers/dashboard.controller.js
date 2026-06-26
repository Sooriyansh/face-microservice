const Attendance = require('../../models/Attendance');
const Student = require('../../models/Student');
const SystemEvent = require('../../models/SystemEvent');
const WorkSession = require('../../models/WorkSession');

async function getEmployeePageData(req) {
    const employeeQuery = req.user.role === 'employee' ? { email: req.user.email } : {};
    const employee = await Student.findOne(employeeQuery).sort({ createdAt: -1 }).lean();
    const attendanceQuery = employee ? { student: employee._id } : {};
    const employeeFirstName = employee ? String(employee.name || '').split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const eventUserPattern = employeeFirstName ? new RegExp(employeeFirstName, 'i') : /.^/;

    const [records, personalEvents, workSession] = await Promise.all([
      Attendance.find(attendanceQuery).sort({ markedAt: -1 }).limit(20).populate('student').lean(),
      SystemEvent.find(employee ? { user: eventUserPattern } : {}).sort({ occurredAt: -1 }).limit(20).lean(),
      employee
        ? WorkSession.findOne({ employee: employee._id, dateKey: new Date().toISOString().slice(0, 10) })
            .populate('employee')
            .populate('attendance')
            .lean()
        : null,
    ]);

    return { employee, records, personalEvents, workSession };
}

function renderEmployeePage(view) {
  return async function employeePage(req, res, next) {
    try {
      res.render(`employee/${view}`, await getEmployeePageData(req));
    } catch (error) {
      next(error);
    }
  };
}

async function dashboard(req, res, next) {
  try {
    res.render('employee/dashboard', await getEmployeePageData(req));
  } catch (error) {
    next(error);
  }
}

module.exports = {
  attendancePage: renderEmployeePage('attendance'),
  attendanceHistoryPage: renderEmployeePage('attendance-history'),
  activityPage: renderEmployeePage('activity'),
  dashboard,
  devicePage: renderEmployeePage('device'),
  enrollmentPage: renderEmployeePage('enrollment'),
  leaveHistoryPage: renderEmployeePage('leave-history'),
  leavePage: renderEmployeePage('leave'),
  overtimePage: renderEmployeePage('overtime'),
  workSessionPage: renderEmployeePage('work-session'),
};
