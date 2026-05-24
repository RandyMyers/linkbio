/**
 * Move legacy profile fields (highlightStats, ritualSteps, pullQuote, pressLine, heroCaption) into customLinks blocks.
 */

function newId() {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function hasActiveBlock(links, type) {
  return (links || []).some((b) => b.type === type && b.active !== false);
}

function migrateProfileToBlocks(profile) {
  if (!profile) return { profile, changed: false, moves: [] };

  const doc = profile.toObject ? profile.toObject() : { ...profile };
  const customLinks = [...(doc.customLinks || [])];
  const moves = [];
  let insertAt = 0;

  const stats = doc.highlightStats || [];
  if (stats.length > 0 && !hasActiveBlock(customLinks, 'stats')) {
    customLinks.splice(insertAt, 0, {
      id: newId(),
      type: 'stats',
      active: true,
      title: '',
      url: '',
      items: stats.map((s) => ({
        id: s.id || newId(),
        value: s.value || '',
        label: s.label || '',
      })),
    });
    moves.push('highlightStats→stats');
    insertAt += 1;
  }

  const quote = String(doc.pullQuote || '').trim();
  if (quote && !hasActiveBlock(customLinks, 'quote')) {
    customLinks.splice(insertAt, 0, {
      id: newId(),
      type: 'quote',
      active: true,
      text: quote,
      title: '',
      url: '',
    });
    moves.push('pullQuote→quote');
    insertAt += 1;
  }

  const ritual = doc.ritualSteps || [];
  if (ritual.length > 0 && !hasActiveBlock(customLinks, 'ritual')) {
    customLinks.push({
      id: newId(),
      type: 'ritual',
      active: true,
      title: 'Four steps. Five minutes.',
      eyebrow: 'The Ritual',
      url: '',
      steps: ritual.map((s) => ({
        id: s.id || newId(),
        step: s.step || '',
        name: s.name || '',
        note: s.note || '',
      })),
    });
    moves.push('ritualSteps→ritual');
  }

  const press = String(doc.pressLine || '').trim();
  if (press && !hasActiveBlock(customLinks, 'banner')) {
    const parts = press.split('·').map((s) => s.trim()).filter(Boolean);
    customLinks.push({
      id: newId(),
      type: 'banner',
      active: true,
      left: parts[0] || press,
      right: parts.length > 1 ? parts.slice(1).join(' · ') : '',
      title: '',
      url: '',
    });
    moves.push('pressLine→banner');
  }

  let profileOut = {
    ...doc,
    highlightStats: [],
    ritualSteps: [],
    pullQuote: '',
    pressLine: '',
    customLinks,
  };

  const caption = String(doc.heroCaption || '').trim();
  if (caption && !hasActiveBlock(customLinks, 'caption')) {
    profileOut.customLinks = [
      ...profileOut.customLinks,
      {
        id: newId(),
        type: 'caption',
        active: true,
        text: caption,
        title: '',
        url: '',
      },
    ];
    profileOut.heroCaption = '';
    moves.push('heroCaption→caption');
  }

  if (!moves.length) {
    return { profile: doc, changed: false, moves: [] };
  }

  return {
    profile: profileOut,
    changed: true,
    moves,
  };
}

function profileNeedsBlockMigration(profile) {
  if (!profile) return false;
  const doc = profile.toObject ? profile.toObject() : profile;
  if ((doc.highlightStats || []).length > 0) return true;
  if ((doc.ritualSteps || []).length > 0) return true;
  if (String(doc.pullQuote || '').trim()) return true;
  if (String(doc.pressLine || '').trim()) return true;
  if (String(doc.heroCaption || '').trim() && !hasActiveBlock(doc.customLinks, 'caption')) return true;
  return false;
}

module.exports = {
  migrateProfileToBlocks,
  profileNeedsBlockMigration,
  newId,
};
