const authRoutes = require('./auth.routes');
const adminDashboardRoutes = require('./admin/dashboard.routes');
const adminAttendanceRoutes = require('./admin/attendance.routes');
const adminLeaveRoutes = require('./admin/leave.routes');
const adminMonitoringRoutes = require('./admin/monitoring.routes');
const adminOvertimeRoutes = require('./admin/overtime.routes');
const adminReportsRoutes = require('./admin/reports.routes');
const employeeDashboardRoutes = require('./employee/dashboard.routes');
const apiRoutes = require('./api');

function registerRoutes(app) {
  app.use(authRoutes);
  app.use(adminDashboardRoutes);
  app.use(adminAttendanceRoutes);
  app.use(adminLeaveRoutes);
  app.use(adminMonitoringRoutes);
  app.use(adminOvertimeRoutes);
  app.use(adminReportsRoutes);
  app.use(employeeDashboardRoutes);
  app.use('/api', apiRoutes);
}

module.exports = { registerRoutes };
