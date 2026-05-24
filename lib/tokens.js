const jwt = require('jsonwebtoken');
const config = require('../config');

function signUserToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function verifyUserToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    return null;
  }
}

module.exports = { signUserToken, verifyUserToken };
