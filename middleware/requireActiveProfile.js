const { resolveActiveProfile, PROFILE_HEADER } = require('../services/profileAccess');

/**
 * Resolves the active BioProfile for the authenticated user.
 * Uses X-LinkBio-Profile-Id header, then User.activeProfileId, then default profile.
 */
async function requireActiveProfile(req, res, next) {
  try {
    const hint = req.headers[PROFILE_HEADER] || req.query.profileId;
    const profile = await resolveActiveProfile(req.userId, hint);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    req.profile = profile;
    req.profileId = profile._id.toString();
    next();
  } catch (e) {
    res.status(e.statusCode || 500).json({
      error: e.message || 'Could not load profile',
      code: e.code,
    });
  }
}

module.exports = { requireActiveProfile };
