const express = require('express');
const adminController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/admin/reports', requireRole('admin'), adminController.dailyReportsPage);
router.get('/daily-reports', requireRole('admin'), (req, res) => res.redirect('/admin/reports'));

module.exports = router;
