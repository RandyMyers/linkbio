const https = require('https');

const PROVIDERS = [
  { name: 'youtube', pattern: /(?:youtube\.com\/watch|youtu\.be\/)/i },
  { name: 'vimeo', pattern: /vimeo\.com\//i },
  { name: 'spotify', pattern: /open\.spotify\.com\//i },
  { name: 'tiktok', pattern: /tiktok\.com\//i },
];

function detectProvider(url) {
  for (const p of PROVIDERS) {
    if (p.pattern.test(url)) return p.name;
  }
  return 'generic';
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function enrichEmbedBlock(block) {
  if (!block?.url || block.type !== 'embed') return block;
  const provider = block.embedProvider || detectProvider(block.url);
  const out = { ...block, embedProvider: provider };

  try {
    const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(block.url)}`;
    const data = await fetchJson(oembedUrl);
    if (data && typeof data === 'object') {
      out.oembed = {
        title: data.title || '',
        thumbnail_url: data.thumbnail_url || '',
        html: data.html || '',
        provider_name: data.provider_name || provider,
        fetchedAt: new Date().toISOString(),
      };
    }
  } catch {
    /* optional enrichment */
  }

  return out;
}

async function enrichCustomLinks(links) {
  if (!Array.isArray(links)) return links;
  return Promise.all(links.map((b) => (b.type === 'embed' ? enrichEmbedBlock(b) : b)));
}

module.exports = { enrichEmbedBlock, enrichCustomLinks, detectProvider };
