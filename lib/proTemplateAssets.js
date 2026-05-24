/**
 * Demo image URLs (files in client/public/pro-templates). Keep in sync with client proTemplateAssets.js
 */

const BASE = '/pro-templates';

function p(file) {
  return `${BASE}/${file}`;
}

const PRO_TEMPLATE_ASSETS = {
  aurora: { backgroundImage: p('aurora-bg.jpg'), avatar: p('avatar.jpg') },
  editorial: { avatar: p('expert-portrait.jpg') },
  storefront: {
    avatar: p('creator-portrait.jpg'),
    productImages: [p('product-sneaker.jpg'), p('product-serum.jpg'), p('product-mug.jpg'), p('product-bag.jpg')],
  },
  artist: { backgroundImage: p('artist-dj.jpg'), avatar: p('artist-dj.jpg') },
  brutalist: { avatar: p('creator-portrait.jpg') },
  coach: { avatar: p('coach-fitness.jpg') },
  magazine: { backgroundImage: p('expert-portrait.jpg'), avatar: p('expert-portrait.jpg') },
  skincare: {
    avatar: p('skincare/founder.jpg'),
    productImages: [
      p('skincare/serum-amber.jpg'),
      p('skincare/cream-jar.jpg'),
      p('skincare/cleanser.jpg'),
      p('skincare/mask-clay.jpg'),
    ],
  },
};

function getAssets(templateId) {
  return PRO_TEMPLATE_ASSETS[String(templateId || '').toLowerCase()] || null;
}

function productsWithDemoImages(cards, templateId) {
  const pool = getAssets(templateId)?.productImages || [];
  return (cards || []).map((card, i) => ({
    ...card,
    image: card.image || pool[i] || '',
  }));
}

module.exports = { PRO_TEMPLATE_ASSETS, getAssets, productsWithDemoImages };
