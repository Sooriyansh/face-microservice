module.exports = {
  logger: require('./logger'),
  database: require('./database/mongo'),
  response: require('./response'),
  events: require('./events/envelope'),
};

