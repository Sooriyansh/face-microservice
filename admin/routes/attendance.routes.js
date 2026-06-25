const express = require('express');
const adminController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/admin/attendance', requireRole('admin'), adminController.attendancePage);
router.get('/attendance', requireRole('admin'), (req, res) => res.redirect('/admin/attendance'));

module.exports = router;
