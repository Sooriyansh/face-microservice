const express = require('express');
const attendanceRoutes = require('./attendance.api');
const hrmsRoutes = require('./hrms.api');
const notificationRoutes = require('./notifications.api');
const studentRoutes = require('./employees.api');
const systemEventRoutes = require('./system-events.api');
const workSessionRoutes = require('./work-sessions.api');
const { requireAuth } = require('../../middleware/roleCheck');
const { notFoundApi } = require('../../middleware/errorHandler');

const router = express.Router();

router.use('/students', requireAuth, studentRoutes);
router.use('/attendance', requireAuth, attendanceRoutes);
router.use('/system-events', requireAuth, systemEventRoutes);
router.use('/work-sessions', requireAuth, workSessionRoutes);
router.use('/hrms', requireAuth, hrmsRoutes);
router.use('/notifications', requireAuth, notificationRoutes);
router.use(notFoundApi);

module.exports = router;

