const { handleNowPaymentsIpn } = require('../services/nowpaymentsWebhook');
const { asyncHandler } = require('../middleware/errorHandler');

exports.handleIpn = asyncHandler(async (req, res) => {
  const signature = req.headers['x-nowpayments-sig'];
  try {
    const result = await handleNowPaymentsIpn(req.body, signature);
    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});
