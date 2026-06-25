require('dotenv').config();

const express = require('express');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const logger = require('../../shared/logger');
const { tryRebuildFaceModelFromCloud } = require('../../../services/faceModel');

const serviceName = process.env.SERVICE_NAME || 'training-service';
const port = Number(process.env.PORT || 8092);
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(correlationId);
healthRoutes(serviceName)(app);

app.post('/api/training/jobs', async (req, res, next) => {
  try {
    const result = await tryRebuildFaceModelFromCloud();
    res.status(result.success ? 202 : 500).json({
      success: result.success,
      job: {
        status: result.success ? 'completed' : 'failed',
        message: result.message || '',
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  logger.error('Training request failed', { error: error.message, correlationId: req.correlationId });
  res.status(500).json({ success: false, message: error.message });
});

app.listen(port, () => logger.info(`${serviceName} listening`, { port }));

