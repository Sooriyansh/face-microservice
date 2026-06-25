const authRoutes = require('./auth.routes');
const adminDashboardRoutes = require('../admin/routes/dashboard.routes');
const adminAttendanceRoutes = require('../admin/routes/attendance.routes');
const adminLeaveRoutes = require('../admin/routes/leave.routes');
const adminMonitoringRoutes = require('../admin/routes/monitoring.routes');
const adminOvertimeRoutes = require('../admin/routes/overtime.routes');
const adminReportsRoutes = require('../admin/routes/reports.routes');
const employeeDashboardRoutes = require('../emp/routes/dashboard.routes');
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
