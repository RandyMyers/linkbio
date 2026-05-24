function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOgSvg(profile) {
  const name = escapeXml(profile.name || profile.username || 'LinkBio');
  const bio = escapeXml((profile.bio || '').slice(0, 120));
  const accent = escapeXml(profile.colors?.accent || '#1a1a1a');
  const bg = escapeXml(profile.colors?.background || '#f5f0e8');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${bg}"/>
  <rect x="60" y="60" width="1080" height="510" rx="32" fill="#ffffff" opacity="0.92"/>
  <text x="100" y="200" font-family="system-ui, sans-serif" font-size="64" font-weight="700" fill="${accent}">${name}</text>
  <text x="100" y="280" font-family="system-ui, sans-serif" font-size="32" fill="#444444">@${escapeXml(profile.username)}</text>
  <text x="100" y="360" font-family="system-ui, sans-serif" font-size="28" fill="#666666">${bio}</text>
  <text x="100" y="520" font-family="system-ui, sans-serif" font-size="24" fill="#999999">linkbio.app</text>
</svg>`;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildJsonLd(profile, publicUrl) {
  const url = publicUrl || `https://linkbio.app/@${profile.username}`;
  const seo = profile.seo || {};
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.name,
    description: seo.description || profile.bio || '',
    url,
    image: profile.avatar || seo.ogImage || undefined,
    sameAs: (profile.socialLinks || []).map((s) => s.url).filter(Boolean),
  };
}

function buildFaqJsonLd(profile) {
  const mainEntity = [];
  (profile.customLinks || []).forEach((block) => {
    if (!block || (block.type !== 'accordion' && block.type !== 'faq') || block.active === false) return;
    const panels = Array.isArray(block.panels) ? block.panels : [];
    if (panels.length > 0) {
      panels.forEach((panel) => {
        const name = String(panel.title || '').trim();
        const text = stripHtml(panel.bodyHtml || panel.body);
        if (name && text) {
          mainEntity.push({
            '@type': 'Question',
            name,
            acceptedAnswer: { '@type': 'Answer', text },
          });
        }
      });
      return;
    }
    const text = stripHtml(block.bodyHtml || block.body);
    if (!text) return;
    mainEntity.push({
      '@type': 'Question',
      name: String(block.title || 'FAQ').trim(),
      acceptedAnswer: { '@type': 'Answer', text },
    });
  });
  if (!mainEntity.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity };
}

function buildPublicJsonLd(profile, publicUrl) {
  const graphs = [buildJsonLd(profile, publicUrl)];
  const faq = buildFaqJsonLd(profile);
  if (faq) graphs.push(faq);
  return graphs;
}

module.exports = { buildOgSvg, buildJsonLd, buildFaqJsonLd, buildPublicJsonLd };
