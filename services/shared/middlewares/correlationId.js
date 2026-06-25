const crypto = require('crypto');

function correlationId(req, res, next) {
  const id = req.get('x-correlation-id') || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}

module.exports = { correlationId };

