const express = require('express');
const adminController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/admin/system-events', requireRole('admin'), adminController.systemEventsPage);
router.get('/system-events', requireRole('admin'), (req, res) => res.redirect('/admin/system-events'));

module.exports = router;
