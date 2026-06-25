const express = require('express');
const adminController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/', requireRole('admin'), (req, res) => res.redirect('/admin/dashboard'));
router.get('/admin', requireRole('admin'), (req, res) => res.redirect('/admin/dashboard'));
router.get('/admin/dashboard', requireRole('admin'), adminController.dashboard);
router.get('/admin/employees', requireRole('admin'), adminController.employeesPage);
router.get('/admin/performance', requireRole('admin'), adminController.performancePage);
router.get('/admin/analytics', requireRole('admin'), adminController.analyticsPage);
router.get('/admin/notifications', requireRole('admin'), adminController.notificationsPage);
router.get('/admin/settings', requireRole('admin'), adminController.settingsPage);

module.exports = router;
