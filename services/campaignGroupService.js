const crypto = require('crypto');
const MarketingCampaign = require('../models/MarketingCampaign');
const { serializeCampaign } = require('./mailchimpCampaignService');

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `group-${crypto.randomBytes(4).toString('hex')}`;
}

async function listCampaignGroups() {
  const rows = await MarketingCampaign.aggregate([
    { $match: { campaignGroupId: { $nin: [null, ''] } } },
    {
      $group: {
        _id: '$campaignGroupId',
        count: { $sum: 1 },
        locales: { $addToSet: '$locale' },
        statuses: { $addToSet: '$status' },
        updatedAt: { $max: '$updatedAt' },
      },
    },
    { $sort: { updatedAt: -1 } },
  ]);
  return {
    groups: rows.map((r) => ({
      id: r._id,
      campaignCount: r.count,
      locales: (r.locales || []).filter(Boolean),
      statuses: r.statuses || [],
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    })),
  };
}

async function getCampaignGroup(groupId) {
  const gid = String(groupId || '').trim();
  if (!gid) return null;
  const campaigns = await MarketingCampaign.find({ campaignGroupId: gid })
    .sort({ updatedAt: -1 })
    .lean();
  if (!campaigns.length) return null;
  return {
    id: gid,
    campaigns: campaigns.map(serializeCampaign),
    campaignCount: campaigns.length,
  };
}

function createCampaignGroupId(name) {
  return slugify(name);
}

module.exports = {
  listCampaignGroups,
  getCampaignGroup,
  createCampaignGroupId,
};
