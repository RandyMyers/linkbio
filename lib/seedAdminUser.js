const config = require('../config');
const User = require('../models/User');

/**
 * Ensures a platform admin account exists for local/dev login.
 * Set ADMIN_SEED_EMAIL + ADMIN_SEED_PASSWORD in server/.env (dev only recommended).
 */
async function seedAdminUser() {
  const seedEmail = String(process.env.ADMIN_SEED_EMAIL || '')
    .trim()
    .toLowerCase();
  const seedPassword = String(process.env.ADMIN_SEED_PASSWORD || '').trim();

  const emailFromList = config.adminEmails[0] || '';
  const email = seedEmail || emailFromList || 'admin@linkbio.local';

  if (!email) {
    return { skipped: true, reason: 'no email configured' };
  }

  const password =
    seedPassword ||
    (config.nodeEnv !== 'production' ? 'Admin123!' : '');

  if (!password) {
    // eslint-disable-next-line no-console
    console.warn(
      '[linkbio/seed] Set ADMIN_SEED_PASSWORD (or ADMIN_SEED_EMAIL + password) to create an admin user.',
    );
    return { skipped: true, reason: 'no password' };
  }

  let user = await User.findOne({ email });
  const passwordHash = await User.hashPassword(password);

  if (!user) {
    user = await User.create({
      email,
      passwordHash,
      name: 'Platform Admin',
      role: 'admin',
      emailVerified: true,
    });
    // eslint-disable-next-line no-console
    console.log(`[linkbio/seed] Created admin user: ${email}`);
    return { created: true, email };
  }

  const updates = {};
  if (user.role !== 'admin') updates.role = 'admin';
  if (seedPassword) updates.passwordHash = passwordHash;
  if (!user.name) updates.name = 'Platform Admin';

  if (Object.keys(updates).length) {
    await User.updateOne({ _id: user._id }, { $set: updates });
    // eslint-disable-next-line no-console
    console.log(`[linkbio/seed] Updated admin user: ${email}`);
    return { updated: true, email };
  }

  return { exists: true, email };
}

module.exports = { seedAdminUser };
