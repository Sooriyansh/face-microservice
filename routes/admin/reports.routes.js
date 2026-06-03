const express = require('express');
const adminController = require('../../controllers/admin/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/daily-reports', requireRole('admin'), adminController.dailyReportsPage);

module.exports = router;
