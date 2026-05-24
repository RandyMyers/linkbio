const { ingestEvent } = require('../services/eventIngest');
const { asyncHandler } = require('../middleware/errorHandler');

exports.ingest = asyncHandler(async (req, res) => {
  try {
    const result = await ingestEvent(req, req.body);
    res.status(result.ignored ? 202 : 201).json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});
