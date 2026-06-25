require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { connectMongo } = require('../../shared/database/mongo');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const logger = require('../../shared/logger');

const auditSchema = new mongoose.Schema(
  {
    actorId: String,
    actorRole: String,
    action: { type: String, required: true },
    resource: String,
    metadata: Object,
    correlationId: String,
  },
  { timestamps: true }
);

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema);
const serviceName = process.env.SERVICE_NAME || 'audit-service';
const port = Number(process.env.PORT || 8087);
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(correlationId);
healthRoutes(serviceName)(app);

app.post('/api/audit/logs', async (req, res, next) => {
  try {
    const log = await AuditLog.create({
      actorId: req.get('x-user-id') || req.body.actorId,
      actorRole: req.get('x-user-role') || req.body.actorRole,
      action: req.body.action,
      resource: req.body.resource,
      metadata: req.body.metadata || {},
      correlationId: req.correlationId,
    });
    res.status(201).json({ success: true, log });
  } catch (error) {
    next(error);
  }
});

app.get('/api/audit/logs', async (req, res, next) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  logger.error('Audit request failed', { error: error.message, correlationId: req.correlationId });
  res.status(500).json({ success: false, message: error.message });
});

connectMongo()
  .then(() => app.listen(port, () => logger.info(`${serviceName} listening`, { port })))
  .catch((error) => {
    logger.error('Service startup failed', { error: error.message });
    process.exit(1);
  });

