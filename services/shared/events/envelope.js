const crypto = require('crypto');

function createEventEnvelope({ eventType, producer, payload, correlationId, eventVersion = 1 }) {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    eventVersion,
    occurredAt: new Date().toISOString(),
    correlationId: correlationId || crypto.randomUUID(),
    producer,
    payload,
  };
}

module.exports = { createEventEnvelope };

