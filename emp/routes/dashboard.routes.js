const express = require('express');
const employeeController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/employee', requireRole('admin', 'employee'), employeeController.dashboard);

module.exports = router;
