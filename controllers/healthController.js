const { getMongoConnectionLabel } = require('../lib/db');
const config = require('../config');

exports.health = (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'linkbio-server',
    environment: config.nodeEnv,
    database: getMongoConnectionLabel(),
    timestamp: new Date().toISOString(),
  });
};
