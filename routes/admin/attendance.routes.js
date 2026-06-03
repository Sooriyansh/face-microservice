const express = require('express');
const adminController = require('../../controllers/admin/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/attendance', requireRole('admin'), adminController.attendancePage);

module.exports = router;
