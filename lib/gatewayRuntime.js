const PlatformSettings = require('../models/PlatformSettings');

async function getGatewayRuntimeMode() {
  const doc = await PlatformSettings.findById('global').lean();
  return doc?.gatewayRuntimeMode === 'production' ? 'production' : 'sandbox';
}

function normalizeEnvironment(value) {
  return value === 'production' ? 'production' : 'sandbox';
}

module.exports = {
  getGatewayRuntimeMode,
  normalizeEnvironment,
};
