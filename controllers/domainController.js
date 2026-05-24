const BioProfile = require('../models/BioProfile');
const CustomDomain = require('../models/CustomDomain');
const { entitlementLimits } = require('../lib/entitlements');
const User = require('../models/User');
const {
  generateVerificationToken,
  verifyDomainRecord,
  devInstructions,
} = require('../services/customDomainVerify');
const { asyncHandler } = require('../middleware/errorHandler');

function normalizeHost(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

exports.list = asyncHandler(async (req, res) => {
  const rows = await CustomDomain.find({ userId: req.userId }).sort({ createdAt: -1 }).lean();
  res.json({
    domains: rows.map((d) => ({
      id: d._id.toString(),
      hostname: d.hostname,
      status: d.status,
      sslStatus: d.sslStatus,
      verificationToken: d.verificationToken,
      lastCheckedAt: d.lastCheckedAt ? new Date(d.lastCheckedAt).toISOString() : null,
      failureReason: d.failureReason || '',
      instructions: devInstructions(d),
    })),
  });
});

exports.create = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  const profile = req.profile;
  if (!user || !profile) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  const { limits } = await entitlementLimits(user);
  if (!limits.customDomains) {
    res.status(403).json({
      error: 'Custom domains require a Pro or Studio plan.',
      code: 'PLAN_LIMIT',
    });
    return;
  }

  const hostname = normalizeHost(req.body.hostname || req.body.domain);
  if (!hostname || hostname.length < 4) {
    res.status(400).json({ error: 'Valid hostname required.' });
    return;
  }

  const count = await CustomDomain.countDocuments({ userId: req.userId, status: { $ne: 'failed' } });
  if (count >= limits.customDomains) {
    res.status(403).json({ error: 'Custom domain limit reached for your plan.', code: 'PLAN_LIMIT' });
    return;
  }

  const existing = await CustomDomain.findOne({ hostname });
  if (existing && existing.userId.toString() !== req.userId) {
    res.status(409).json({ error: 'Domain already registered.' });
    return;
  }

  let doc =
    existing ||
    (await CustomDomain.create({
      userId: req.userId,
      profileId: profile._id,
      hostname,
      verificationToken: generateVerificationToken(),
      status: 'pending',
    }));

  profile.customDomain = hostname;
  await profile.save();

  res.status(201).json({
    id: doc._id.toString(),
    hostname: doc.hostname,
    status: doc.status,
    instructions: devInstructions(doc),
  });
});

exports.verify = asyncHandler(async (req, res) => {
  const doc = await CustomDomain.findOne({ _id: req.params.id, userId: req.userId });
  if (!doc) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  const result = await verifyDomainRecord(doc);
  res.json(result);
});

exports.remove = asyncHandler(async (req, res) => {
  const doc = await CustomDomain.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!doc) {
    res.status(404).json({ error: 'Domain not found' });
    return;
  }
  const profile = await BioProfile.findById(doc.profileId);
  if (profile && profile.userId.toString() === req.userId && profile.customDomain === doc.hostname) {
    profile.customDomain = '';
    await profile.save();
  }
  res.json({ ok: true });
});
