const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['creator', 'admin'], default: 'creator' },
    emailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    subscriptionPlan: { type: String, default: 'free', lowercase: true, trim: true },
    subscriptionStatus: { type: String, default: 'none', lowercase: true, trim: true },
    subscriptionPaidThrough: { type: Date, default: null },
    subscriptionBillingInterval: { type: String, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    subscriptionPeriodStart: { type: Date, default: null },
    scheduledPlanSlug: { type: String, default: null, lowercase: true, trim: true },
    scheduledChangeAt: { type: Date, default: null },
    lastSubscriptionEventAt: { type: Date, default: null },
    accountCredit: {
      usd: { type: Number, default: 0 },
      eur: { type: Number, default: 0 },
      gbp: { type: Number, default: 0 },
    },
    activeProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BioProfile',
      default: null,
    },
    onboardingCompleted: { type: Boolean, default: false },
    notificationPrefs: {
      weeklyAnalytics: { type: Boolean, default: true },
      newSubscribers: { type: Boolean, default: true },
      productUpdates: { type: Boolean, default: false },
      subscriptionBilling: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
};

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
