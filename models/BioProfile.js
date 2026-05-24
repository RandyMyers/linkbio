const mongoose = require('mongoose');
const { decryptJson } = require('../lib/secrets');

const linkSchema = new mongoose.Schema(
  {
    id: String,
    type: String,
    title: String,
    url: String,
    active: Boolean,
    thumbnail: String,
    description: String,
    imageUrl: String,
    embedProvider: String,
    faqItems: String,
    faqStyle: String,
    accordionItems: String,
    accordionStyle: String,
    body: String,
    bodyHtml: String,
    panels: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    mode: String,
    targetDate: String,
    amounts: String,
    subtitle: String,
    featured: Boolean,
    tag: String,
    icon: String,
  },
  { _id: false, strict: false },
);

const bioProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: '', trim: true, maxlength: 80 },
    isDefault: { type: Boolean, default: false },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    verified: { type: Boolean, default: false },
    pronouns: { type: String, default: '' },
    location: { type: String, default: '' },
    name: { type: String, default: 'Your Name' },
    bio: { type: String, default: '', maxlength: 500 },
    avatar: { type: String, default: '' },
    socialLinks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    customLinks: { type: [linkSchema], default: [] },
    productCards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    template: { type: String, default: 'minimal' },
    buttonStyle: { type: String, default: 'rounded' },
    fontFamily: { type: String, default: 'inter' },
    linkLayout: { type: String, default: 'list' },
    productLayout: { type: String, default: 'grid' },
    hideWatermark: { type: Boolean, default: false },
    colors: { type: mongoose.Schema.Types.Mixed, default: {} },
    seo: { type: mongoose.Schema.Types.Mixed, default: {} },
    pixels: { type: mongoose.Schema.Types.Mixed, default: {} },
    customDomain: { type: String, default: '' },
    backgroundImage: { type: String, default: '' },
    pageBadge: { type: String, default: '' },
    eyebrowLabel: { type: String, default: '' },
    shopSectionTitle: { type: String, default: '' },
    shopSectionEyebrow: { type: String, default: '' },
    pullQuote: { type: String, default: '' },
    pressLine: { type: String, default: '' },
    heroCaption: { type: String, default: '' },
    highlightStats: { type: [mongoose.Schema.Types.Mixed], default: [] },
    ritualSteps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    suspended: { type: Boolean, default: false },
    suspendedReason: { type: String, default: '' },
    published: { type: mongoose.Schema.Types.Mixed, default: null },
    publishedAt: { type: Date, default: null },
    draftUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

bioProfileSchema.index({ userId: 1, createdAt: 1 });
bioProfileSchema.index({ userId: 1, isDefault: 1 });

bioProfileSchema.methods.toClientDraft = function toClientDraft() {
  return {
    id: this._id.toString(),
    label: this.label || '',
    isDefault: !!this.isDefault,
    username: this.username,
    name: this.name,
    verified: this.verified,
    pronouns: this.pronouns,
    location: this.location,
    bio: this.bio,
    avatar: this.avatar,
    socialLinks: this.socialLinks || [],
    customLinks: this.customLinks || [],
    productCards: this.productCards || [],
    template: this.template,
    buttonStyle: this.buttonStyle,
    fontFamily: this.fontFamily,
    linkLayout: this.linkLayout,
    hideWatermark: this.hideWatermark,
    productLayout: this.productLayout,
    colors: this.colors || {},
    seo: this.seo || {},
    pixels: decryptJson(this.pixels) || this.pixels || {},
    customDomain: this.customDomain || '',
    backgroundImage: this.backgroundImage || '',
    pageBadge: this.pageBadge || '',
    eyebrowLabel: this.eyebrowLabel || '',
    shopSectionTitle: this.shopSectionTitle || '',
    shopSectionEyebrow: this.shopSectionEyebrow || '',
    pullQuote: this.pullQuote || '',
    pressLine: this.pressLine || '',
    heroCaption: this.heroCaption || '',
    highlightStats: this.highlightStats || [],
    ritualSteps: this.ritualSteps || [],
    published: Boolean(this.published),
    publishedAt: this.publishedAt ? this.publishedAt.toISOString() : null,
  };
};

bioProfileSchema.statics.findPublicByUsername = async function findPublicByUsername(username) {
  const doc = await this.findOne({ username }).lean();
  if (!doc || !doc.published || doc.suspended) return null;
  return doc.published;
};

module.exports = mongoose.models.BioProfile || mongoose.model('BioProfile', bioProfileSchema);
