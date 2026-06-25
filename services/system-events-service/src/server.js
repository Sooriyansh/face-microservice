require('dotenv').config();

const express = require('express');
const { connectMongo } = require('../../shared/database/mongo');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const { serviceUserContext } = require('../../shared/jwt/context');
const logger = require('../../shared/logger');
const { errorHandler } = require('../../../middleware/errorHandler');
const systemEventRoutes = require('../../../routes/api/system-events.api');

const serviceName = process.env.SERVICE_NAME || 'system-events-service';
const port = Number(process.env.PORT || 8094);
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(correlationId);
app.use(serviceUserContext);
healthRoutes(serviceName)(app);
app.use('/api/system-events', systemEventRoutes);
app.use(errorHandler);

connectMongo()
  .then(() => app.listen(port, () => logger.info(`${serviceName} listening`, { port })))
  .catch((error) => {
    logger.error('Service startup failed', { error: error.message });
    process.exit(1);
  });

