require('dotenv').config();

const express = require('express');
const { connectMongo } = require('../../shared/database/mongo');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const { serviceUserContext } = require('../../shared/jwt/context');
const logger = require('../../shared/logger');
const { errorHandler } = require('../../../middleware/errorHandler');
const attendanceRoutes = require('../../../routes/api/attendance.api');
const workSessionRoutes = require('../../../routes/api/work-sessions.api');
const hrmsRoutes = require('../../../routes/api/hrms.api');

const serviceName = process.env.SERVICE_NAME || 'attendance-service';
const port = Number(process.env.PORT || 8083);
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(correlationId);
app.use(serviceUserContext);
healthRoutes(serviceName)(app);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/work-sessions', workSessionRoutes);
app.use('/api/hrms', hrmsRoutes);
app.use(errorHandler);

connectMongo()
  .then(() => app.listen(port, () => logger.info(`${serviceName} listening`, { port })))
  .catch((error) => {
    logger.error('Service startup failed', { error: error.message });
    process.exit(1);
  });

