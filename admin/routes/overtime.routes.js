const express = require('express');
const adminController = require('../controllers/dashboard.controller');
const { requireRole } = require('../../middleware/roleCheck');

const router = express.Router();

router.get('/admin/overtime', requireRole('admin'), adminController.overtimePage);
router.get('/overtime-dashboard', requireRole('admin'), (req, res) => res.redirect('/admin/overtime'));

module.exports = router;
