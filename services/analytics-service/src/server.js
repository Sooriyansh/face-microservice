require('dotenv').config();

const express = require('express');
const { connectMongo } = require('../../shared/database/mongo');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const logger = require('../../shared/logger');
const Attendance = require('../../../models/Attendance');
const Student = require('../../../models/Student');
const SystemEvent = require('../../../models/SystemEvent');

const serviceName = process.env.SERVICE_NAME || 'analytics-service';
const port = Number(process.env.PORT || 8088);
const app = express();

app.use(express.json());
app.use(correlationId);
healthRoutes(serviceName)(app);

app.get('/api/analytics/summary', async (req, res, next) => {
  try {
    const dateKey = req.query.date || new Date().toISOString().slice(0, 10);
    const [students, attendance, systemEvents] = await Promise.all([
      Student.countDocuments(),
      Attendance.countDocuments({ dateKey }),
      SystemEvent.countDocuments(),
    ]);
    res.json({ success: true, dateKey, students, attendance, systemEvents });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  logger.error('Analytics request failed', { error: error.message, correlationId: req.correlationId });
  res.status(500).json({ success: false, message: error.message });
});

connectMongo()
  .then(() => app.listen(port, () => logger.info(`${serviceName} listening`, { port })))
  .catch((error) => {
    logger.error('Service startup failed', { error: error.message });
    process.exit(1);
  });

