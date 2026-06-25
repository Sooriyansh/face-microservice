const express = require('express');

const app = express();
const port = Number(process.env.PORT || 8080);
const serviceName = process.env.SERVICE_NAME || 'node-service';

app.use(express.json({ limit: '10mb' }));

app.get('/health/live', (req, res) => {
  res.json({ status: 'live', service: serviceName });
});

app.get('/health/ready', (req, res) => {
  res.json({ status: 'ready', service: serviceName });
});

app.get('/', (req, res) => {
  res.json({
    service: serviceName,
    message: 'Replace this template with a Clean Architecture service implementation.',
  });
});

app.listen(port, () => {
  console.log(`${serviceName} listening on ${port}`);
});

