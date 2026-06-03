const express = require('express');
const adminController = require('../../controllers/admin/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/overtime-dashboard', requireRole('admin'), adminController.overtimePage);

module.exports = router;
