const config = require('../config');
const User = require('../models/User');

async function requireAdmin(req, res, next) {
  const user = await User.findById(req.userId).lean();
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const isAdmin =
    user.role === 'admin' ||
    (user.email && config.adminEmails.includes(String(user.email).toLowerCase()));

  if (!isAdmin) {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }

  next();
}

module.exports = { requireAdmin };
