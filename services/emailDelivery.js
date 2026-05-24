const config = require('../config');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Delivers notification emails when SMTP is configured; otherwise logs in development.
 * Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 */
async function sendEmail({ to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  const from = process.env.EMAIL_FROM || 'noreply@linkbio.app';

  if (!host || !to) {
    if (config.nodeEnv === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[linkbio/email] To: ${to}\nSubject: ${subject}\n${text}\n---`);
    }
    return { sent: false, logged: true };
  }

  try {
    // Optional: dynamic import if nodemailer is installed later
    // eslint-disable-next-line import/no-unresolved, global-require
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transporter.sendMail({ from, to, subject, text, html: html || text });
    return { sent: true };
  } catch (err) {
    if (config.nodeEnv === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[linkbio/email] SMTP failed (${err.message}); logging instead:\nTo: ${to}\n${text}`);
      return { sent: false, logged: true };
    }
    throw err;
  }
}

async function deliverPendingNotificationEmails({ limit = 50 } = {}) {
  const cap = Math.min(100, Number(limit) || 50);
  const pending = await Notification.find({
    category: 'subscription',
    readAt: null,
    emailSentAt: null,
    createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
  })
    .sort({ createdAt: -1 })
    .limit(cap)
    .lean();

  let sent = 0;
  let skipped = 0;

  for (const n of pending) {
    const user = await User.findById(n.userId).select('email notificationPrefs').lean();
    if (!user?.email) {
      skipped += 1;
      continue;
    }
    if (user.notificationPrefs?.subscriptionBilling === false) {
      await Notification.updateOne({ _id: n._id }, { $set: { emailSentAt: new Date() } });
      skipped += 1;
      continue;
    }

    const base = config.clientOrigin || 'http://localhost:3000';
    const link = n.linkUrl?.startsWith('http') ? n.linkUrl : `${base}${n.linkUrl || '/dashboard/billing'}`;

    const result = await sendEmail({
      to: user.email,
      subject: n.title,
      text: `${n.body}\n\n${link}`,
      html: `<p>${n.body}</p><p><a href="${link}">Open billing</a></p>`,
    });

    if (result.sent || result.logged) {
      await Notification.updateOne({ _id: n._id }, { $set: { emailSentAt: new Date() } });
      sent += 1;
    }
  }

  return { processed: pending.length, sent, skipped };
}

module.exports = { sendEmail, deliverPendingNotificationEmails };
