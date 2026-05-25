const { mailchimpRequest } = require('../lib/mailchimpClient');

async function listTemplates({ count = 50, type = 'user' } = {}) {
  const cap = Math.min(1000, Math.max(1, Number(count) || 50));
  const q = new URLSearchParams({ count: String(cap), type: String(type || 'user') });
  const data = await mailchimpRequest(`/templates?${q}`);
  const templates = (data.templates || []).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    thumbnail: t.thumbnail || '',
    createdAt: t.date_created,
    editedAt: t.date_edited,
    active: t.active,
    dragAndDrop: t.drag_and_drop,
  }));
  return { templates, total: data.total_items ?? templates.length };
}

async function getTemplate(templateId) {
  const id = String(templateId || '').trim();
  if (!id) {
    const err = new Error('Template ID required.');
    err.statusCode = 400;
    throw err;
  }
  const t = await mailchimpRequest(`/templates/${id}`);
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    html: t.html || '',
    thumbnail: t.thumbnail || '',
    createdAt: t.date_created,
    editedAt: t.date_edited,
    active: t.active,
  };
}

async function createTemplate({ name, html }) {
  const body = {
    name: String(name || 'LinkBio template').slice(0, 100),
    html: html || '<html><body><p>Hello *|FNAME|*,</p></body></html>',
  };
  const t = await mailchimpRequest('/templates', { method: 'POST', body });
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    html: t.html || '',
  };
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
};
