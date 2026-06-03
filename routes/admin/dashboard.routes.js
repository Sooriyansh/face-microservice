const express = require('express');
const adminController = require('../../controllers/admin/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/', requireRole('admin'), adminController.dashboard);

module.exports = router;
