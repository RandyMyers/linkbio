/**
 * Classify HTTP referrers into creator-friendly traffic sources.
 */
function classifyReferrer(referrer) {
  const raw = String(referrer || '').trim();
  if (!raw) return 'Direct / unknown';

  const r = raw.toLowerCase();
  if (r.includes('instagram.com') || r.includes('l.instagram')) return 'Instagram';
  if (r.includes('tiktok.com') || r.includes('vm.tiktok')) return 'TikTok';
  if (r.includes('facebook.com') || r.includes('fb.com') || r.includes('fb.me')) return 'Facebook';
  if (r.includes('twitter.com') || r.includes('x.com') || r.includes('t.co')) return 'X (Twitter)';
  if (r.includes('youtube.com') || r.includes('youtu.be')) return 'YouTube';
  if (r.includes('linkedin.com')) return 'LinkedIn';
  if (r.includes('pinterest.')) return 'Pinterest';
  if (r.includes('threads.net')) return 'Threads';
  if (r.includes('snapchat.com')) return 'Snapchat';
  if (r.includes('google.')) return 'Google';
  if (r.includes('bing.com')) return 'Bing';
  if (r.includes('linkbio')) return 'LinkBio';

  try {
    const host = new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./i, '');
    return host || 'Other';
  } catch {
    return 'Other';
  }
}

module.exports = { classifyReferrer };
