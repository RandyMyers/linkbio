const { handleStripeWebhook } = require('../services/stripeWebhook');
const { asyncHandler } = require('../middleware/errorHandler');

exports.handleWebhook = asyncHandler(async (req, res) => {
  try {
    const rawBody = req.body;
    const result = await handleStripeWebhook(rawBody, req.headers);
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});
