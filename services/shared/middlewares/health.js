function healthRoutes(serviceName) {
  return (app) => {
    app.get('/health/live', (req, res) => {
      res.json({ status: 'live', service: serviceName });
    });

    app.get('/health/ready', (req, res) => {
      res.json({ status: 'ready', service: serviceName });
    });
  };
}

module.exports = { healthRoutes };

