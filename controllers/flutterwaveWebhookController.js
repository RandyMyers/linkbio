const { handleFlutterwaveWebhook } = require('../services/flutterwaveWebhook');
const { asyncHandler } = require('../middleware/errorHandler');

exports.handleWebhook = asyncHandler(async (req, res) => {
  try {
    const result = await handleFlutterwaveWebhook(req.body, req.headers);
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});
