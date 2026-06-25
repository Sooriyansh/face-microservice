require('dotenv').config();

const express = require('express');
const path = require('path');
const { connectMongo } = require('../../shared/database/mongo');
const { correlationId } = require('../../shared/middlewares/correlationId');
const { healthRoutes } = require('../../shared/middlewares/health');
const logger = require('../../shared/logger');
const { attachCurrentUser } = require('../../../middleware/auth');
const { defaultViewLocals } = require('../../../middleware/locals');
const { errorHandler } = require('../../../middleware/errorHandler');
const authRoutes = require('../../../routes/auth.routes');

const serviceName = process.env.SERVICE_NAME || 'auth-service';
const port = Number(process.env.PORT || 8081);
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../../views'));
app.use(express.static(path.join(__dirname, '../../../public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(correlationId);
app.use(attachCurrentUser);
app.use(defaultViewLocals);
healthRoutes(serviceName)(app);
app.use('/api/auth', authRoutes);
app.use(authRoutes);
app.use(errorHandler);

connectMongo()
  .then(() => app.listen(port, () => logger.info(`${serviceName} listening`, { port })))
  .catch((error) => {
    logger.error('Service startup failed', { error: error.message });
    process.exit(1);
  });

