const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const WorkSession = require('../models/WorkSession');
const { notifyAdmins, notifyEmployee } = require('./notifications');
const { getDateKey } = require('./workSessions');

function tryRequire(name) {
  try {
    return require(name);
  } catch (error) {
    return null;
  }
}

async function createOnce(key, creator) {
  const existing = await Notification.findOne({ 'metadata.jobKey': key }).select('_id').lean();
  if (existing) return null;
  const notification = await creator();
  return notification;
}

async function sendAttendanceReminders() {
  const dateKey = getDateKey();
  const [employees, attendanceRecords] = await Promise.all([
    Student.find().sort({ name: 1 }).lean(),
    Attendance.find({ dateKey }).select('student').lean(),
  ]);
  const present = new Set(attendanceRecords.map((record) => String(record.student)));

  await Promise.allSettled(
    employees
      .filter((employee) => !present.has(String(employee._id)))
      .map((employee) =>
        createOnce(`attendance-reminder:${dateKey}:${employee._id}`, () =>
          notifyEmployee(employee, {
            title: 'Attendance Reminder',
            message: 'Your work session has not started yet. Please mark your attendance.',
            type: 'Attendance',
            priority: 'high',
            actionUrl: '/employee',
            metadata: { jobKey: `attendance-reminder:${dateKey}:${employee._id}` },
          })
        )
      )
  );
}

async function sendLateAttendanceAlerts() {
  const dateKey = getDateKey();
  const [employees, attendanceRecords] = await Promise.all([
    Student.find().sort({ name: 1 }).lean(),
    Attendance.find({ dateKey }).select('student').lean(),
  ]);
  const present = new Set(attendanceRecords.map((record) => String(record.student)));
  const missing = employees.filter((employee) => !present.has(String(employee._id)));

  if (!missing.length) return;

  await createOnce(`late-attendance-alert:${dateKey}`, () =>
    notifyAdmins({
      title: 'Late Attendance Alert',
      message: `${missing.length} employee(s) have not marked attendance yet.`,
      type: 'Attendance',
      priority: 'high',
      actionUrl: '/attendance',
      metadata: {
        jobKey: `late-attendance-alert:${dateKey}`,
        employeeIds: missing.map((employee) => String(employee._id)),
      },
    })
  );
}

async function sendWorkSessionReminders() {
  const dateKey = getDateKey();
  const sessions = await WorkSession.find({
    dateKey,
    status: { $nin: ['checked_out'] },
    $or: [{ dailyPlan: '' }, { dailyPlan: { $exists: false } }],
  }).populate('employee').lean();

  await Promise.allSettled(
    sessions
      .filter((session) => session.employee)
      .map((session) =>
        createOnce(`join-work-reminder:${dateKey}:${session.employee._id}`, () =>
          notifyEmployee(session.employee, {
            title: 'Work Session Reminder',
            message: "Please start your work session and enter today's work plan.",
            type: 'Login Reminder',
            priority: 'high',
            actionUrl: '/employee#daily-work-session',
            metadata: { jobKey: `join-work-reminder:${dateKey}:${session.employee._id}` },
          })
        )
      )
  );
}

async function sendCheckoutReminders() {
  const dateKey = getDateKey();
  const sessions = await WorkSession.find({
    dateKey,
    status: { $nin: ['checked_out'] },
  }).populate('employee').lean();

  await Promise.allSettled(
    sessions
      .filter((session) => session.employee)
      .map((session) =>
        createOnce(`checkout-reminder:${dateKey}:${session.employee._id}`, () =>
          notifyEmployee(session.employee, {
            title: 'Checkout Reminder',
            message: 'Please submit your daily work report and complete your checkout.',
            type: 'Checkout',
            priority: 'high',
            actionUrl: '/employee#daily-work-session',
            metadata: { jobKey: `checkout-reminder:${dateKey}:${session.employee._id}` },
          })
        )
      )
  );
}

async function sendWeeklySummary() {
  const now = new Date();
  const weekKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${Math.ceil(now.getDate() / 7)}`;
  const sessions = await WorkSession.find({}).sort({ dateKey: -1 }).limit(1000).lean();
  const totalWorkingMs = sessions.reduce((total, session) => total + Number(session.totalWorkingMs || 0), 0);
  const overtimeMs = sessions.reduce((total, session) => total + Number(session.overtimeMs || 0), 0);

  await createOnce(`weekly-summary:${weekKey}`, () =>
    notifyAdmins({
      title: 'Weekly Summary',
      message: `Weekly attendance summary is ready. Work hours: ${Math.round(totalWorkingMs / 3600000)}h, overtime: ${Math.round(overtimeMs / 3600000)}h.`,
      type: 'Daily Report',
      priority: 'normal',
      actionUrl: '/daily-reports',
      metadata: { jobKey: `weekly-summary:${weekKey}`, totalWorkingMs, overtimeMs },
    })
  );
}

function schedule(cron, expression, task) {
  cron.schedule(expression, () => {
    task().catch((error) => console.warn(`Notification job failed: ${error.message}`));
  });
}

function initializeNotificationJobs() {
  const cron = tryRequire('node-cron');
  if (!cron) {
    console.warn('node-cron is not installed. Scheduled notifications are disabled.');
    return;
  }

  const timezone = process.env.NOTIFICATION_TIMEZONE || 'Asia/Kolkata';
  const options = { timezone };
  cron.schedule('45 8 * * 1-6', () => sendAttendanceReminders().catch((error) => console.warn(error.message)), options);
  cron.schedule('15 9 * * 1-6', () => sendLateAttendanceAlerts().catch((error) => console.warn(error.message)), options);
  cron.schedule('15 9 * * 1-6', () => sendWorkSessionReminders().catch((error) => console.warn(error.message)), options);
  cron.schedule('30 17 * * 1-6', () => sendCheckoutReminders().catch((error) => console.warn(error.message)), options);
  cron.schedule('0 18 * * 5', () => sendWeeklySummary().catch((error) => console.warn(error.message)), options);
}

module.exports = {
  initializeNotificationJobs,
  sendAttendanceReminders,
  sendCheckoutReminders,
  sendLateAttendanceAlerts,
  sendWeeklySummary,
  sendWorkSessionReminders,
};
