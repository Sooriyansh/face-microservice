require('dotenv').config();

const express = require('express');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const logger = require('../../shared/logger');
const { runRecognition } = require('../../../services/faceRecognition');

const serviceName = process.env.SERVICE_NAME || 'face-recognition-service';
const port = Number(process.env.PORT || 8093);
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(correlationId);
healthRoutes(serviceName)(app);

app.post('/api/recognition/scan', async (req, res, next) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, message: 'image is required' });
    }

    const [, encoded] = image.split(',');
    if (!encoded) {
      return res.status(400).json({ success: false, message: 'Invalid image payload' });
    }

    const recognition = await runRecognition(Buffer.from(encoded, 'base64'));
    res.json({ success: true, ...recognition });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  logger.error('Recognition request failed', { error: error.message, correlationId: req.correlationId });
  res.status(500).json({ success: false, message: error.message });
});

app.listen(port, () => logger.info(`${serviceName} listening`, { port }));

