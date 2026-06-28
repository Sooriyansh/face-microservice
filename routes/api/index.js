const express = require('express');
const attendanceRoutes = require('./attendance.api');
const hrmsRoutes = require('./hrms.api');
const notificationRoutes = require('./notifications.api');
const studentRoutes = require('./employees.api');
const systemEventRoutes = require('./system-events.api');
const workSessionRoutes = require('./work-sessions.api');
const { getWorkSchedule, saveWorkSchedule } = require('../../services/workSchedule');
const { requireAuth } = require('../../middleware/roleCheck');
const { notFoundApi } = require('../../middleware/errorHandler');

const router = express.Router();

router.use('/students', requireAuth, studentRoutes);
router.use('/attendance', requireAuth, attendanceRoutes);
router.use('/system-events', requireAuth, systemEventRoutes);
router.use('/work-sessions', requireAuth, workSessionRoutes);
router.use('/hrms', requireAuth, hrmsRoutes);
router.use('/notifications', requireAuth, notificationRoutes);
router.get('/work-schedule', requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, schedule: await getWorkSchedule() });
  } catch (error) {
    next(error);
  }
});
router.post('/work-schedule', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can update work schedule settings.' });
    }
    res.json({ success: true, schedule: await saveWorkSchedule(req.body, req.user?._id || null) });
  } catch (error) {
    next(error);
  }
});
router.use(notFoundApi);

module.exports = router;

