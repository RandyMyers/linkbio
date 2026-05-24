const { asyncHandler } = require('../middleware/errorHandler');

exports.reorder = asyncHandler(async (req, res) => {
  const orderedIds = req.body.orderedIds || req.body.ids;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds array required.' });
    return;
  }

  const profile = req.profile;
  const byId = new Map(profile.customLinks.map((l) => [l.id, l]));
  const reordered = [];
  for (const id of orderedIds) {
    if (byId.has(id)) reordered.push(byId.get(id));
  }
  for (const link of profile.customLinks) {
    if (!orderedIds.includes(link.id)) reordered.push(link);
  }

  profile.customLinks = reordered;
  profile.draftUpdatedAt = new Date();
  await profile.save();

  res.json(profile.toClientDraft());
});
