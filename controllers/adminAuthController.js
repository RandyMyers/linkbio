const User = require('../models/User');
const config = require('../config');
const { signUserToken } = require('../lib/tokens');
const { setAuthCookie } = require('../lib/authCookies');
const { asyncHandler } = require('../middleware/errorHandler');

exports.login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = await User.findOne({ email });
  const isAdmin =
    user &&
    (user.role === 'admin' || config.adminEmails.includes(email));

  if (!isAdmin || !user || !(await user.comparePassword(password))) {
    res.status(401).json({ error: 'Invalid admin credentials.' });
    return;
  }

  const token = signUserToken(user._id.toString());
  setAuthCookie(res, token);
  res.json({
    token,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: 'admin',
    },
  });
});
