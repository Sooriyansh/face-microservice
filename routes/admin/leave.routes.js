const express = require('express');
const adminController = require('../../controllers/admin/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/leave-requests', requireRole('admin'), adminController.leaveManagementPage);

module.exports = router;
